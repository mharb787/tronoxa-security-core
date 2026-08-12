import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'tronoxa.bsc.homeAssets.v1.56.';
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export type BscHomeAssetValues = Readonly<{
  bnb: number;
  usdt: number;
  bnbUsdPrice: number | null;
  usdtUsdPrice: number;
}>;

type StoredBscHomeAssetValues = Readonly<{
  version: 1;
  values: BscHomeAssetValues;
  updatedAt: string;
}>;

const memory = new Map<string, StoredBscHomeAssetValues>();

export async function getLastBscHomeAssetValues(address: string): Promise<BscHomeAssetValues | null> {
  let key: string;
  try {
    key = storageKey(address);
  } catch {
    return null;
  }

  const cached = memory.get(key);
  if (cached) return cached.values;

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const stored = assertStored(JSON.parse(raw));
    memory.set(key, stored);
    return stored.values;
  } catch {
    return null;
  }
}

export async function storeLastBscHomeAssetValues(
  address: string,
  values: BscHomeAssetValues,
): Promise<void> {
  const key = storageKey(address);
  const stored = assertStored({
    version: 1,
    values,
    updatedAt: new Date().toISOString(),
  });
  memory.set(key, stored);
  await AsyncStorage.setItem(key, JSON.stringify(stored));
}

function storageKey(address: string) {
  const normalized = String(address ?? '').trim().toLowerCase();
  if (!ADDRESS_PATTERN.test(normalized)) throw new Error('bsc_home_cache_address_invalid');
  return `${STORAGE_PREFIX}${normalized}`;
}

function assertStored(value: unknown): StoredBscHomeAssetValues {
  const stored = value as Partial<StoredBscHomeAssetValues>;
  const values = stored.values as Partial<BscHomeAssetValues> | undefined;
  if (
    stored.version !== 1
    || !values
    || !isNonNegativeFinite(values.bnb)
    || !isNonNegativeFinite(values.usdt)
    || (values.bnbUsdPrice !== null && !isPositiveFinite(values.bnbUsdPrice))
    || !isPositiveFinite(values.usdtUsdPrice)
    || !isIsoDate(stored.updatedAt)
  ) {
    throw new Error('bsc_home_cache_invalid');
  }

  return Object.freeze({
    version: 1,
    values: Object.freeze({
      bnb: values.bnb,
      usdt: values.usdt,
      bnbUsdPrice: values.bnbUsdPrice,
      usdtUsdPrice: values.usdtUsdPrice,
    }),
    updatedAt: stored.updatedAt,
  });
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}
