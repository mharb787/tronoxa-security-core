export type SupportedBscChainId = 56 | 97;
export type BscNetwork = Readonly<{
    chainId: SupportedBscChainId;
    hexChainId: '0x38' | '0x61';
    name: 'BNB Smart Chain Mainnet' | 'BNB Smart Chain Testnet';
    nativeSymbol: 'BNB';
    explorerBaseUrl: string;
}>;
export declare const BSC_NETWORKS: Readonly<Record<SupportedBscChainId, BscNetwork>>;
export declare function getBscNetwork(chainId: number): BscNetwork;
//# sourceMappingURL=networks.d.ts.map
