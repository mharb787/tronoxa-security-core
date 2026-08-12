import type { SupportedBscChainId } from '../config/networks.js';
export type BscToken = Readonly<{
    chainId: SupportedBscChainId;
    symbol: 'USDT';
    name: 'Binance-Peg BSC-USD';
    address: string;
    decimals: 18;
    transferSelector: '0xa9059cbb';
}>;
export declare const BSC_MAINNET_USDT: BscToken;
export declare const BSC_TOKEN_ALLOWLIST: readonly [Readonly<{
    chainId: SupportedBscChainId;
    symbol: "USDT";
    name: "Binance-Peg BSC-USD";
    address: string;
    decimals: 18;
    transferSelector: "0xa9059cbb";
}>];
//# sourceMappingURL=allowlist.d.ts.map