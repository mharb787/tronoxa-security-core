import { Transaction, type TransactionRequest } from 'ethers';
import type { SupportedBscChainId } from '../config/networks.js';
import type { BscToken } from '../tokens/allowlist.js';
export type LegacyFee = Readonly<{
    type: 'legacy';
    gasPrice: bigint;
}>;
export type Eip1559Fee = Readonly<{
    type: 'eip1559';
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
}>;
export type BscFee = LegacyFee | Eip1559Fee;
export type PreparedTransaction = Readonly<{
    chainId: SupportedBscChainId;
    from: string;
    to: string;
    value: bigint;
    data: string;
    nonce: number;
    gasLimit: bigint;
    fee: BscFee;
}>;
export declare function encodeTokenTransfer(recipient: string, amount: bigint): string;
export declare function applyGasSafetyMargin(estimate: bigint, marginBps?: number): bigint;
export declare function maximumFee(prepared: PreparedTransaction): bigint;
export declare function assertBalances(input: {
    prepared: PreparedTransaction;
    bnbBalance: bigint;
    tokenBalance?: bigint;
    tokenAmount?: bigint;
    maximumAllowedFee?: bigint;
}): void;
export declare function prepareBnbTransfer(input: Omit<PreparedTransaction, 'to' | 'data'> & {
    to: string;
}): PreparedTransaction;
export declare function prepareTokenTransfer(input: Omit<PreparedTransaction, 'to' | 'value' | 'data'> & {
    token: BscToken;
    recipient: string;
    amount: bigint;
}): PreparedTransaction;
export interface TransactionSigner {
    getAddress(): Promise<string>;
    signTransaction(transaction: TransactionRequest): Promise<string>;
}
export declare function signPreparedTransaction(prepared: PreparedTransaction, signer: TransactionSigner): Promise<string>;
export declare function decodeAndVerifySignedTransaction(rawTransaction: string, expected: PreparedTransaction): Transaction;
//# sourceMappingURL=prepare.d.ts.map
