import { type SupportedBscChainId } from '../config/networks.js';
import type { BscToken } from '../tokens/allowlist.js';
import type { JsonRpcTransport } from './transport.js';
export type BscReadClientConfig = Readonly<{
    chainId: SupportedBscChainId;
    transports: readonly JsonRpcTransport[];
    timeoutMs?: number;
    maxAttempts?: number;
}>;
export declare function parseRpcQuantity(value: unknown): bigint;
export declare class BscReadClient {
    #private;
    readonly chainId: SupportedBscChainId;
    constructor(config: BscReadClientConfig);
    request(method: string, params?: readonly unknown[]): Promise<unknown>;
    getBnbBalance(address: string): Promise<bigint>;
    getTokenBalance(address: string, token: BscToken): Promise<bigint>;
    getPendingNonce(address: string): Promise<number>;
    getGasPrice(): Promise<bigint>;
    estimateGas(transaction: Readonly<{
        from: string;
        to: string;
        value?: bigint;
        data?: string;
    }>): Promise<bigint>;
    simulateCall(transaction: Readonly<{
        from: string;
        to: string;
        value?: bigint;
        data?: string;
    }>): Promise<string>;
    waitForTransactionReceipt(hash: string, policy?: ReceiptPolicy): Promise<BscTransactionReceipt>;
    broadcastSignedTransaction(rawTransaction: string): Promise<string>;
}
export type ReceiptPolicy = Readonly<{
    confirmations?: number;
    timeoutMs?: number;
    pollIntervalMs?: number;
}>;
export type BscTransactionReceipt = Readonly<{
    transactionHash: string;
    blockHash: string;
    blockNumber: bigint;
    status: 'confirmed' | 'reverted';
    gasUsed: bigint;
}>;
export declare function createBscReadClient(config: BscReadClientConfig): BscReadClient;
//# sourceMappingURL=client.d.ts.map
