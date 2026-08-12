import { loadBscCore, type TronoxaBscCore } from './adapter';
import { createTronoxaBscReadClient } from './client';
import { createBscSendService } from './send-service';

export type TronoxaBscRuntime = Readonly<{
  core: TronoxaBscCore;
  client: Awaited<ReturnType<typeof createTronoxaBscReadClient>>;
  send: ReturnType<typeof createBscSendService>;
}>;

let runtimePromise: Promise<TronoxaBscRuntime> | null = null;

export function getTronoxaBscRuntime(): Promise<TronoxaBscRuntime> {
  runtimePromise ??= (async () => {
    const [core, client] = await Promise.all([loadBscCore(), createTronoxaBscReadClient()]);
    return Object.freeze({
      core,
      client,
      send: createBscSendService({
        core,
        client,
        ...(client.chainId === 56 ? { usdtToken: core.BSC_MAINNET_USDT } : {}),
      }),
    });
  })();
  return runtimePromise;
}

export function resetTronoxaBscRuntimeForTesting(): void {
  runtimePromise = null;
}
