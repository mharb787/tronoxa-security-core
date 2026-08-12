import { loadBscCore } from './adapter';
import { BSC_FEATURE_FLAGS } from './feature-flags';
import { getBscMobileReadConfig, getBscTestnetConfig } from './network-config';
import { TronoxaBscRelayTransport } from './relay-transport';

export async function createTronoxaBscReadClient() {
  if (!BSC_FEATURE_FLAGS.enabled) throw new Error('bsc_feature_disabled');
  const core = await loadBscCore();
  const config = getBscMobileReadConfig();
  if (config.chainId === 56) {
    return core.createBscReadClient({
      chainId: 56,
      transports: [new TronoxaBscRelayTransport()],
      timeoutMs: 8_000,
      maxAttempts: 1,
    });
  }
  const transports = config.rpcUrls.map((url, index) => (
    new core.FetchJsonRpcTransport(`bnb-official-testnet-${index + 1}`, url)
  ));
  return core.createBscReadClient({
    chainId: 97,
    transports,
    timeoutMs: 8_000,
    maxAttempts: transports.length,
  });
}

export async function createTronoxaBscTestnetClient() {
  const core = await loadBscCore();
  const config = getBscTestnetConfig();
  const transports = config.rpcUrls.map((url, index) => (
    new core.FetchJsonRpcTransport(`bnb-official-testnet-${index + 1}`, url)
  ));
  return core.createBscReadClient({
    chainId: config.chainId,
    transports,
    timeoutMs: 8_000,
    maxAttempts: transports.length,
  });
}
