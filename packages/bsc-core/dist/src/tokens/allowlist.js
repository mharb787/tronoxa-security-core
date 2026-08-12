import { getAddress } from 'ethers';
export const BSC_MAINNET_USDT = Object.freeze({
    chainId: 56,
    symbol: 'USDT',
    name: 'Binance-Peg BSC-USD',
    address: getAddress('0x55d398326f99059ff775485246999027b3197955'),
    decimals: 18,
    transferSelector: '0xa9059cbb',
});
export const BSC_TOKEN_ALLOWLIST = Object.freeze([BSC_MAINNET_USDT]);
//# sourceMappingURL=allowlist.js.map
