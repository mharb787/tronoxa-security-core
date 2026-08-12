import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TronoxaBscRuntime } from './runtime';
import { fetchWithDeviceSession } from '../lib/api';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const CACHE_PREFIX = 'bsc.history.v1';
export const BSC_HISTORY_ACTIVE_REFRESH_INTERVAL_MS = 60_000;

export type BscHistoryItem = Readonly<{
  key: string;
  hash: string;
  blockNumber: string;
  timestampMs: number;
  asset: 'BNB' | 'USDT_BEP20';
  direction: 'in' | 'out';
  from: string;
  to: string;
  amountBaseUnits: string;
  status: 'confirmed' | 'failed';
}>;

export type BscHistoryPage = Readonly<{
  items: readonly BscHistoryItem[];
  pageKey: string | null;
}>;

export type BscHistoryRefreshHealth = Readonly<{
  consecutiveFailures: number;
  showWarning: boolean;
}>;

export const HEALTHY_BSC_HISTORY_REFRESH: BscHistoryRefreshHealth = Object.freeze({
  consecutiveFailures: 0,
  showWarning: false,
});

export function recordBscHistoryRefreshSuccess(): BscHistoryRefreshHealth {
  return HEALTHY_BSC_HISTORY_REFRESH;
}

export function recordBscHistoryRefreshFailure(
  current: BscHistoryRefreshHealth,
  hasUsableHistory: boolean,
): BscHistoryRefreshHealth {
  const consecutiveFailures = current.consecutiveFailures + 1;
  return Object.freeze({
    consecutiveFailures,
    showWarning: !hasUsableHistory || consecutiveFailures >= 3,
  });
}

export async function fetchBscHistoryPage(
  runtime: TronoxaBscRuntime,
  address: string,
  pageKey?: string,
): Promise<BscHistoryPage> {
  const checksum = runtime.core.toChecksumAddress(address);
  if (runtime.client.chainId !== 56) return Object.freeze({ items: Object.freeze([]), pageKey: null });
  const base = new URL(process.env.EXPO_PUBLIC_API_URL ?? 'https://api.tronoxa.com/api/v1');
  const local = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
  if (base.protocol !== 'https:' && !local) throw new Error('bsc_history_https_required');
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/bsc-history/${encodeURIComponent(checksum)}`;
  base.search = pageKey ? new URLSearchParams({ cursor: pageKey }).toString() : '';
  base.hash = '';
  const response = await fetchWithDeviceSession(base.toString(), { method: 'GET' });
  if (!response.ok) throw new Error('bsc_history_unavailable');
  const result = await response.json();
  return parseHistoryPage(
    result,
    checksum,
    runtime.client.chainId === 56 ? runtime.core.BSC_MAINNET_USDT.address : null,
  );
}

export function parseHistoryPage(
  input: unknown,
  walletAddress: string,
  approvedUsdtAddress: string | null,
): BscHistoryPage {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('bsc_history_response_invalid');
  const root = input as Record<string, unknown>;
  if (!Array.isArray(root.transfers)) throw new Error('bsc_history_response_invalid');
  const wallet = normalizeAddress(walletAddress);
  const usdt = approvedUsdtAddress ? normalizeAddress(approvedUsdtAddress) : null;
  const items: BscHistoryItem[] = [];
  const seen = new Set<string>();
  for (const raw of root.transfers) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    try {
      const value = raw as Record<string, unknown>;
      const category = value.category;
      const contract = typeof value.contractAddress === 'string' ? normalizeAddress(value.contractAddress) : null;
      const asset = category === 'external' && value.asset === 'BNB'
        ? 'BNB'
        : category === '20' && usdt !== null && contract === usdt
          ? 'USDT_BEP20'
          : null;
      if (!asset) continue;
      const hash = requireHash(value.hash);
      const from = requireAddress(value.from);
      const to = requireAddress(value.to);
      if (from !== wallet && to !== wallet) continue;
      const amount = requireQuantity(value.value);
      if (amount <= 0n) continue;
      const block = requireQuantity(value.blockNum);
      const timestampSeconds = Number(value.blockTimeStamp ?? value.blockTimestamp);
      if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
        throw new Error('bsc_history_response_invalid');
      }
      const providerId = typeof value.uniqueId === 'string' && /^[A-Za-z0-9:_\-]{1,180}$/.test(value.uniqueId)
        ? value.uniqueId : '';
      const key = [hash, asset, providerId, from, to, amount.toString(), block.toString()].join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(Object.freeze({
        key,
        hash,
        blockNumber: block.toString(),
        timestampMs: timestampSeconds * 1_000,
        asset,
        direction: from === wallet ? 'out' : 'in',
        from,
        to,
        amountBaseUnits: amount.toString(),
        status: Number(value.receiptsStatus) === 0 ? 'failed' : 'confirmed',
      }));
    } catch {
      // A single malformed provider record must not hide the rest of a valid page.
    }
  }
  const next = root.pageKey;
  if (next !== undefined && next !== null && (typeof next !== 'string' || (next !== '' && !/^[A-Za-z0-9_:=,\/+\-]{1,512}$/.test(next)))) {
    throw new Error('bsc_history_response_invalid');
  }
  return Object.freeze({ items: Object.freeze(items), pageKey: typeof next === 'string' && next.length > 0 ? next : null });
}

export async function loadCachedBscHistory(chainId: 56 | 97, walletId: string): Promise<BscHistoryItem[]> {
  const raw = await AsyncStorage.getItem(cacheKey(chainId, walletId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      try {
        return [assertCachedHistoryItem(item)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function assertCachedHistoryItem(value: unknown): BscHistoryItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bsc_history_cache_invalid');
  const item = value as Partial<BscHistoryItem>;
  if (
    typeof item.key !== 'string' || item.key.length < 1 || item.key.length > 512
    || typeof item.hash !== 'string' || !HASH.test(item.hash)
    || typeof item.blockNumber !== 'string' || !/^(?:0|[1-9]\d*)$/.test(item.blockNumber)
    || !Number.isSafeInteger(item.timestampMs) || item.timestampMs! < 0
    || (item.asset !== 'BNB' && item.asset !== 'USDT_BEP20')
    || (item.direction !== 'in' && item.direction !== 'out')
    || typeof item.from !== 'string' || !ADDRESS.test(item.from)
    || typeof item.to !== 'string' || !ADDRESS.test(item.to)
    || typeof item.amountBaseUnits !== 'string' || !/^(?:0|[1-9]\d*)$/.test(item.amountBaseUnits)
    || (item.status !== 'confirmed' && item.status !== 'failed')
  ) throw new Error('bsc_history_cache_invalid');
  return Object.freeze({ ...item }) as BscHistoryItem;
}

export async function cacheBscHistory(chainId: 56 | 97, walletId: string, items: readonly BscHistoryItem[]): Promise<void> {
  await AsyncStorage.setItem(cacheKey(chainId, walletId), JSON.stringify(items.slice(0, 300)));
}

function cacheKey(chainId: number, walletId: string): string {
  return `${CACHE_PREFIX}:${chainId}:${walletId}`;
}
function normalizeAddress(value: string): string {
  if (!ADDRESS.test(value)) throw new Error('bsc_history_response_invalid');
  return value.toLowerCase();
}
function requireAddress(value: unknown): string {
  if (typeof value !== 'string') throw new Error('bsc_history_response_invalid');
  return normalizeAddress(value);
}
function requireHash(value: unknown): string {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error('bsc_history_response_invalid');
  return value.toLowerCase();
}
function requireQuantity(value: unknown): bigint {
  if (typeof value !== 'string' || !QUANTITY.test(value)) throw new Error('bsc_history_response_invalid');
  return BigInt(value);
}
