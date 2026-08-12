import { Interface, Transaction } from 'ethers';
import { toChecksumAddress } from '../addresses/bsc-address.js';
import { BscError } from '../errors/bsc-error.js';
const ERC20_TRANSFER = new Interface(['function transfer(address recipient,uint256 amount) returns (bool)']);
export function encodeTokenTransfer(recipient, amount) {
    if (amount <= 0n)
        throw new BscError('INVALID_AMOUNT', 'Token amount must be greater than zero');
    return ERC20_TRANSFER.encodeFunctionData('transfer', [toChecksumAddress(recipient), amount]);
}
export function applyGasSafetyMargin(estimate, marginBps = 2_000) {
    if (estimate <= 0n || !Number.isInteger(marginBps) || marginBps < 0 || marginBps > 5_000) {
        throw new BscError('INVALID_AMOUNT', 'Gas estimate or safety margin is invalid');
    }
    return (estimate * BigInt(10_000 + marginBps) + 9999n) / 10000n;
}
export function maximumFee(prepared) {
    const price = prepared.fee.type === 'legacy' ? prepared.fee.gasPrice : prepared.fee.maxFeePerGas;
    return prepared.gasLimit * price;
}
export function assertBalances(input) {
    const fee = maximumFee(input.prepared);
    if (input.maximumAllowedFee !== undefined && fee > input.maximumAllowedFee) {
        throw new BscError('FEE_LIMIT_EXCEEDED', 'Maximum transaction fee exceeds the configured guard');
    }
    if (input.prepared.value + fee > input.bnbBalance) {
        throw new BscError('INSUFFICIENT_BNB', 'BNB balance is insufficient for value plus maximum fee');
    }
    if (input.tokenAmount !== undefined && (input.tokenBalance === undefined || input.tokenBalance < input.tokenAmount)) {
        throw new BscError('INSUFFICIENT_TOKEN', 'Token balance is insufficient');
    }
}
export function prepareBnbTransfer(input) {
    if (input.value <= 0n)
        throw new BscError('INVALID_AMOUNT', 'BNB amount must be greater than zero');
    return Object.freeze({ ...input, from: toChecksumAddress(input.from), to: toChecksumAddress(input.to), data: '0x' });
}
export function prepareTokenTransfer(input) {
    if (input.token.chainId !== input.chainId)
        throw new BscError('UNSUPPORTED_CHAIN', 'Token chain does not match transaction chain');
    return Object.freeze({
        chainId: input.chainId,
        from: toChecksumAddress(input.from),
        to: input.token.address,
        value: 0n,
        data: encodeTokenTransfer(input.recipient, input.amount),
        nonce: input.nonce,
        gasLimit: input.gasLimit,
        fee: input.fee,
    });
}
export async function signPreparedTransaction(prepared, signer) {
    if (toChecksumAddress(await signer.getAddress()) !== prepared.from) {
        throw new BscError('SIGNER_MISMATCH', 'Signer does not match prepared sender');
    }
    const request = {
        chainId: prepared.chainId,
        to: prepared.to,
        value: prepared.value,
        data: prepared.data,
        nonce: prepared.nonce,
        gasLimit: prepared.gasLimit,
        ...(prepared.fee.type === 'legacy'
            ? { type: 0, gasPrice: prepared.fee.gasPrice }
            : { type: 2, maxFeePerGas: prepared.fee.maxFeePerGas, maxPriorityFeePerGas: prepared.fee.maxPriorityFeePerGas }),
    };
    const rawTransaction = await signer.signTransaction(request);
    decodeAndVerifySignedTransaction(rawTransaction, prepared);
    return rawTransaction;
}
export function decodeAndVerifySignedTransaction(rawTransaction, expected) {
    let decoded;
    try {
        decoded = Transaction.from(rawTransaction);
    }
    catch {
        throw new BscError('SIGNED_TRANSACTION_MISMATCH', 'Signed transaction cannot be decoded');
    }
    const expectedGasPrice = expected.fee.type === 'legacy' ? expected.fee.gasPrice : null;
    const expectedMaxFee = expected.fee.type === 'eip1559' ? expected.fee.maxFeePerGas : null;
    const expectedPriority = expected.fee.type === 'eip1559' ? expected.fee.maxPriorityFeePerGas : null;
    if (decoded.from !== expected.from
        || decoded.to !== expected.to
        || decoded.chainId !== BigInt(expected.chainId)
        || decoded.nonce !== expected.nonce
        || decoded.value !== expected.value
        || decoded.data.toLowerCase() !== expected.data.toLowerCase()
        || decoded.gasLimit !== expected.gasLimit
        || decoded.gasPrice !== expectedGasPrice
        || decoded.maxFeePerGas !== expectedMaxFee
        || decoded.maxPriorityFeePerGas !== expectedPriority) {
        throw new BscError('SIGNED_TRANSACTION_MISMATCH', 'Signed transaction fields differ from the confirmed intent');
    }
    return decoded;
}
//# sourceMappingURL=prepare.js.map