import type { BscReadClient } from '../rpc/client.js';
import type { BscToken } from '../tokens/allowlist.js';
export type FeeEstimate = Readonly<{
    estimatedGas: bigint;
    gasLimit: bigint;
    gasPrice: bigint;
    maximumFee: bigint;
}>;
export type FeeGuard = Readonly<{
    gasMarginBps?: number;
    maximumFeeWei?: bigint;
    maximumGasPriceWei?: bigint;
}>;
export declare function estimateBnbTransfer(client: BscReadClient, request: Readonly<{
    from: string;
    to: string;
    value: bigint;
}>, guard?: FeeGuard): Promise<FeeEstimate>;
export declare function estimateTokenTransfer(client: BscReadClient, request: Readonly<{
    from: string;
    recipient: string;
    token: BscToken;
    amount: bigint;
}>, guard?: FeeGuard): Promise<FeeEstimate>;
export declare function calculateMaxBnbSend(balance: bigint, fee: FeeEstimate): bigint;
//# sourceMappingURL=estimation.d.ts.map
