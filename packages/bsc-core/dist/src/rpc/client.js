import { Interface, isHexString, keccak256, toQuantity } from 'ethers';
import { toChecksumAddress } from '../addresses/bsc-address.js';
import { getBscNetwork } from '../config/networks.js';
import { BscError } from '../errors/bsc-error.js';
const ERC20_BALANCE = new Interface(['function balanceOf(address owner) view returns (uint256)']);
export function parseRpcQuantity(value) {
    if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
        throw new BscError('RPC_MALFORMED_RESPONSE', 'RPC quantity is not canonical hexadecimal');
    }
    return BigInt(value);
}
export class BscReadClient {
    chainId;
    #transports;
    #timeoutMs;
    #maxAttempts;
    constructor(config) {
        getBscNetwork(config.chainId);
        if (config.transports.length === 0)
            throw new BscError('RPC_UNAVAILABLE', 'At least one RPC transport is required');
        this.chainId = config.chainId;
        this.#transports = [...config.transports];
        this.#timeoutMs = boundedInteger(config.timeoutMs, 8_000, 500, 30_000, 'RPC timeout');
        this.#maxAttempts = boundedInteger(config.maxAttempts, this.#transports.length, 1, this.#transports.length, 'RPC maximum attempts');
    }
    async request(method, params = []) {
        let lastError;
        for (let index = 0; index < this.#maxAttempts; index += 1) {
            const transport = this.#transports[index];
            try {
                await this.#assertChain(transport);
                return await this.#timedRequest(transport, method, params);
            }
            catch (error) {
                if (error instanceof BscError && error.code === 'CHAIN_ID_MISMATCH')
                    throw error;
                lastError = error;
            }
        }
        throw new BscError('RPC_UNAVAILABLE', `All configured BSC RPC transports failed: ${safeErrorName(lastError)}`);
    }
    async getBnbBalance(address) {
        return parseRpcQuantity(await this.request('eth_getBalance', [toChecksumAddress(address), 'latest']));
    }
    async getTokenBalance(address, token) {
        if (token.chainId !== this.chainId)
            throw new BscError('UNSUPPORTED_CHAIN', 'Token is not configured for this chain');
        const data = ERC20_BALANCE.encodeFunctionData('balanceOf', [toChecksumAddress(address)]);
        const result = await this.request('eth_call', [{ to: token.address, data }, 'latest']);
        if (typeof result !== 'string')
            throw new BscError('RPC_MALFORMED_RESPONSE', 'Token balance result is not hex data');
        const decoded = ERC20_BALANCE.decodeFunctionResult('balanceOf', result);
        return decoded[0];
    }
    async getPendingNonce(address) {
        const nonce = parseRpcQuantity(await this.request('eth_getTransactionCount', [toChecksumAddress(address), 'pending']));
        if (nonce > BigInt(Number.MAX_SAFE_INTEGER))
            throw new BscError('RPC_MALFORMED_RESPONSE', 'Pending nonce is too large');
        return Number(nonce);
    }
    async getGasPrice() {
        const gasPrice = parseRpcQuantity(await this.request('eth_gasPrice'));
        if (gasPrice <= 0n)
            throw new BscError('RPC_MALFORMED_RESPONSE', 'RPC gas price must be positive');
        return gasPrice;
    }
    async estimateGas(transaction) {
        const data = transaction.data ?? '0x';
        if (!isHexString(data))
            throw new BscError('INVALID_AMOUNT', 'Transaction calldata is not hex data');
        const estimate = parseRpcQuantity(await this.request('eth_estimateGas', [{
                from: toChecksumAddress(transaction.from),
                to: toChecksumAddress(transaction.to),
                value: toQuantity(transaction.value ?? 0n),
                data,
            }]));
        if (estimate <= 0n)
            throw new BscError('RPC_MALFORMED_RESPONSE', 'Gas estimate must be positive');
        return estimate;
    }
    async simulateCall(transaction) {
        const result = await this.request('eth_call', [{
                from: toChecksumAddress(transaction.from),
                to: toChecksumAddress(transaction.to),
                value: toQuantity(transaction.value ?? 0n),
                data: transaction.data ?? '0x',
            }, 'pending']);
        if (typeof result !== 'string' || !isHexString(result)) {
            throw new BscError('RPC_MALFORMED_RESPONSE', 'Call simulation result is not hex data');
        }
        return result;
    }
    async waitForTransactionReceipt(hash, policy = {}) {
        if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
            throw new BscError('RPC_MALFORMED_RESPONSE', 'Transaction hash must be 32 bytes');
        }
        const confirmations = boundedInteger(policy.confirmations, 1, 1, 100, 'Receipt confirmations');
        const timeoutMs = boundedInteger(policy.timeoutMs, 120_000, 1_000, 30 * 60_000, 'Receipt timeout');
        const pollIntervalMs = boundedInteger(policy.pollIntervalMs, 3_000, 250, 30_000, 'Receipt polling interval');
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const value = await this.request('eth_getTransactionReceipt', [hash]);
            if (value !== null) {
                const receipt = parseReceipt(value, hash);
                if (receipt.status === 'reverted') {
                    throw new BscError('TRANSACTION_REVERTED', 'Transaction receipt reports a revert');
                }
                const currentBlock = parseRpcQuantity(await this.request('eth_blockNumber'));
                if (currentBlock >= receipt.blockNumber + BigInt(confirmations - 1))
                    return receipt;
            }
            await delay(pollIntervalMs);
        }
        throw new BscError('TRANSACTION_TIMEOUT', 'Timed out waiting for transaction receipt');
    }
    async broadcastSignedTransaction(rawTransaction) {
        const expectedHash = keccak256(rawTransaction);
        let lastError;
        for (let index = 0; index < this.#maxAttempts; index += 1) {
            const transport = this.#transports[index];
            try {
                await this.#assertChain(transport);
                const returned = await this.#timedRequest(transport, 'eth_sendRawTransaction', [rawTransaction]);
                if (typeof returned !== 'string' || returned.toLowerCase() !== expectedHash.toLowerCase()) {
                    throw new BscError('RPC_MALFORMED_RESPONSE', 'RPC returned a different transaction hash');
                }
                return expectedHash;
            }
            catch (error) {
                if (error instanceof BscError && error.code === 'CHAIN_ID_MISMATCH')
                    throw error;
                lastError = error;
                const known = await this.#findKnownTransaction(expectedHash);
                if (known)
                    return expectedHash;
            }
        }
        throw new BscError('RPC_UNAVAILABLE', `Transaction broadcast was not observed: ${safeErrorName(lastError)}`);
    }
    async #findKnownTransaction(hash) {
        for (const transport of this.#transports) {
            try {
                await this.#assertChain(transport);
                const result = await this.#timedRequest(transport, 'eth_getTransactionByHash', [hash]);
                if (result && typeof result === 'object')
                    return true;
            }
            catch { /* continue recovery probes */ }
        }
        return false;
    }
    async #assertChain(transport) {
        const actual = parseRpcQuantity(await this.#timedRequest(transport, 'eth_chainId', []));
        if (actual !== BigInt(this.chainId)) {
            throw new BscError('CHAIN_ID_MISMATCH', `RPC chain ID ${actual} does not match configured ${this.chainId}`);
        }
    }
    async #timedRequest(transport, method, params) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
        try {
            return await transport.request(method, params, controller.signal);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
export function createBscReadClient(config) {
    return new BscReadClient(config);
}
function safeErrorName(error) {
    return error instanceof Error ? error.name : 'UnknownError';
}
function parseReceipt(value, expectedHash) {
    const receipt = value;
    if (!receipt || typeof receipt !== 'object'
        || typeof receipt.transactionHash !== 'string'
        || receipt.transactionHash.toLowerCase() !== expectedHash.toLowerCase()
        || typeof receipt.blockHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash)) {
        throw new BscError('RPC_MALFORMED_RESPONSE', 'Transaction receipt fields are invalid');
    }
    const status = parseRpcQuantity(receipt.status);
    if (status !== 0n && status !== 1n)
        throw new BscError('RPC_MALFORMED_RESPONSE', 'Receipt status is invalid');
    return Object.freeze({
        transactionHash: receipt.transactionHash,
        blockHash: receipt.blockHash,
        blockNumber: parseRpcQuantity(receipt.blockNumber),
        status: status === 1n ? 'confirmed' : 'reverted',
        gasUsed: parseRpcQuantity(receipt.gasUsed),
    });
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function boundedInteger(value, fallback, minimum, maximum, label) {
    const resolved = value ?? fallback;
    if (!Number.isSafeInteger(resolved)) {
        throw new BscError('INVALID_POLICY', `${label} must be a safe integer`);
    }
    return Math.min(maximum, Math.max(minimum, resolved));
}
//# sourceMappingURL=client.js.map