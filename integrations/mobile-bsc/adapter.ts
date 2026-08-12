import { BSC_FEATURE_FLAGS } from './feature-flags';

export type TronoxaBscCore = typeof import('@tronoxa/bsc-core');

let corePromise: Promise<TronoxaBscCore> | null = null;

/**
 * The only application-level loading boundary for tronoxa-bsc-core.
 * Disabled builds do not execute the BSC module or create an RPC client.
 */
export async function loadBscCore(): Promise<TronoxaBscCore> {
  if (!BSC_FEATURE_FLAGS.enabled) throw new Error('bsc_feature_disabled');
  corePromise ??= import('@tronoxa/bsc-core');
  return corePromise;
}

export function resetBscCoreForTesting(): void {
  corePromise = null;
}

