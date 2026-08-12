export const OFFICIAL_BSC_TESTNET_RPC_URLS = Object.freeze([
  'https://bsc-testnet-dataseed.bnbchain.org',
  'https://bsc-testnet.bnbchain.org',
  'https://bsc-prebsc-dataseed.bnbchain.org',
] as const);

export type BscTestnetConfig = Readonly<{
  chainId: 97;
  rpcUrls: readonly string[];
}>;

export type BscMobileReadConfig =
  | BscTestnetConfig
  | Readonly<{ chainId: 56; relay: 'tronoxa-backend' }>;

export function resolveBscTestnetConfig(input: Readonly<{
  chainId?: string;
  rpcUrls?: string;
}> = {}): BscTestnetConfig {
  const chainId = input.chainId?.trim() || '97';
  if (chainId !== '97') throw new Error('bsc_mainnet_not_approved');
  const configured = (input.rpcUrls ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const rpcUrls = configured.length ? configured : OFFICIAL_BSC_TESTNET_RPC_URLS;
  for (const value of rpcUrls) {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('bsc_rpc_https_required');
    if (url.username || url.password) throw new Error('bsc_rpc_embedded_credentials_rejected');
  }
  return Object.freeze({ chainId: 97, rpcUrls: Object.freeze([...rpcUrls]) });
}

export function resolveBscMobileReadConfig(input: Readonly<{
  chainId?: string;
  mainnetReadEnabled?: string;
  testnetRpcUrls?: string;
}> = {}): BscMobileReadConfig {
  const chainId = input.chainId?.trim() || '97';
  if (chainId === '56') {
    if (input.mainnetReadEnabled !== 'true') throw new Error('bsc_mainnet_read_not_enabled');
    if (input.testnetRpcUrls?.trim()) throw new Error('bsc_mainnet_direct_rpc_rejected');
    return Object.freeze({ chainId: 56, relay: 'tronoxa-backend' as const });
  }
  if (chainId !== '97') throw new Error('bsc_chain_not_supported');
  return resolveBscTestnetConfig({ chainId, rpcUrls: input.testnetRpcUrls });
}

export function getBscTestnetConfig(): BscTestnetConfig {
  return resolveBscTestnetConfig({
    rpcUrls: process.env.EXPO_PUBLIC_BSC_TESTNET_RPC_URLS,
  });
}

export function getBscMobileReadConfig(): BscMobileReadConfig {
  return resolveBscMobileReadConfig({
    chainId: process.env.EXPO_PUBLIC_BSC_CHAIN_ID,
    mainnetReadEnabled: process.env.EXPO_PUBLIC_BSC_MAINNET_READ_ENABLED,
    testnetRpcUrls: process.env.EXPO_PUBLIC_BSC_TESTNET_RPC_URLS,
  });
}
