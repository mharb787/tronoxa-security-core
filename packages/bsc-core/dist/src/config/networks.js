import { BscError } from '../errors/bsc-error.js';
export const BSC_NETWORKS = Object.freeze({
    56: Object.freeze({
        chainId: 56,
        hexChainId: '0x38',
        name: 'BNB Smart Chain Mainnet',
        nativeSymbol: 'BNB',
        explorerBaseUrl: 'https://bscscan.com',
    }),
    97: Object.freeze({
        chainId: 97,
        hexChainId: '0x61',
        name: 'BNB Smart Chain Testnet',
        nativeSymbol: 'BNB',
        explorerBaseUrl: 'https://testnet.bscscan.com',
    }),
});
export function getBscNetwork(chainId) {
    if (chainId !== 56 && chainId !== 97) {
        throw new BscError('UNSUPPORTED_CHAIN', `Unsupported BSC chain ID: ${chainId}`);
    }
    return BSC_NETWORKS[chainId];
}
//# sourceMappingURL=networks.js.map