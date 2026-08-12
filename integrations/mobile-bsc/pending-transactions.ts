import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bsc.pendingTransactions.v1';
const RECOVERY_KEY = 'bsc.pendingTransactions.recovery.v1';
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export type BscTransactionStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'dropped'
  | 'replaced';

export type StoredBscTransaction = Readonly<{
  version: 1;
  hash: string;
  chainId: 56 | 97;
  walletId: string;
  asset: 'BNB' | 'USDT_BEP20';
  from: string;
  to: string;
  amountBaseUnits: string;
  maximumFeeWei: string;
  gasLimit?: string;
  gasPriceWei?: string;
  nonce: number;
  status: BscTransactionStatus;
  createdAt: string;
  updatedAt: string;
  blockNumber?: string;
  replacementHash?: string;
  failureCode?: string;
  /** Links an energy payment to its server order before broadcast for restart-safe recovery. */
  energyOrderId?: string;
  /** Set once the backend has finalized this payment and no further attach POST is needed. */
  energyPaymentAttachedAt?: string;
}>;

let mutationQueue: Promise<void> = Promise.resolve();

export async function listStoredBscTransactions(walletId?: string): Promise<StoredBscTransaction[]> {
  const transactions = await readAll();
  return transactions
    .filter((transaction) => !walletId || transaction.walletId === walletId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function storePendingBscTransaction(
  transaction: Omit<StoredBscTransaction, 'version' | 'status' | 'createdAt' | 'updatedAt' | 'energyPaymentAttachedAt'>,
): Promise<StoredBscTransaction> {
  const now = new Date().toISOString();
  const pending = assertTransaction({
    ...transaction,
    version: 1,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  let stored = pending;
  await mutate((transactions) => {
    const existing = transactions.find((item) => item.hash.toLowerCase() === pending.hash.toLowerCase());
    if (existing) {
      if (
        existing.chainId !== pending.chainId
        || existing.walletId !== pending.walletId
        || existing.asset !== pending.asset
        || existing.from !== pending.from
        || existing.to !== pending.to
        || existing.amountBaseUnits !== pending.amountBaseUnits
        || existing.maximumFeeWei !== pending.maximumFeeWei
        || existing.gasLimit !== pending.gasLimit
        || existing.gasPriceWei !== pending.gasPriceWei
        || existing.nonce !== pending.nonce
        || existing.energyOrderId !== pending.energyOrderId
      ) throw new Error('bsc_transaction_hash_conflict');
      stored = existing;
      return transactions;
    }
    return [pending, ...transactions];
  });
  return stored;
}

export async function markStoredBscEnergyPaymentAttached(hash: string): Promise<StoredBscTransaction> {
  let updated: StoredBscTransaction | null = null;
  await mutate((transactions) => transactions.map((transaction) => {
    if (transaction.hash.toLowerCase() !== hash.toLowerCase()) return transaction;
    if (
      transaction.status !== 'confirmed'
      || transaction.asset !== 'USDT_BEP20'
      || !transaction.energyOrderId
    ) throw new Error('bsc_energy_payment_not_attachable');
    updated = assertTransaction({
      ...transaction,
      energyPaymentAttachedAt: transaction.energyPaymentAttachedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return updated;
  }));
  if (!updated) throw new Error('bsc_transaction_not_found');
  return updated;
}

export async function updateStoredBscTransaction(
  hash: string,
  update: Readonly<{
    status: Exclude<BscTransactionStatus, 'pending'>;
    blockNumber?: string;
    replacementHash?: string;
    failureCode?: string;
  }>,
): Promise<StoredBscTransaction> {
  let updated: StoredBscTransaction | null = null;
  await mutate((transactions) => transactions.map((transaction) => {
    if (transaction.hash.toLowerCase() !== hash.toLowerCase()) return transaction;
    if (transaction.status !== 'pending' && transaction.status !== update.status) {
      throw new Error('bsc_transaction_terminal_state_conflict');
    }
    updated = assertTransaction({
      ...transaction,
      ...update,
      updatedAt: new Date().toISOString(),
    });
    return updated;
  }));
  if (!updated) throw new Error('bsc_transaction_not_found');
  return updated;
}

async function readAll(): Promise<StoredBscTransaction[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await quarantineInvalidStore(raw, []);
    return [];
  }
  if (!Array.isArray(parsed)) {
    await quarantineInvalidStore(raw, []);
    return [];
  }
  const valid: StoredBscTransaction[] = [];
  let invalidFound = false;
  for (const value of parsed) {
    try {
      valid.push(assertTransaction(value));
    } catch {
      invalidFound = true;
    }
  }
  if (invalidFound) await quarantineInvalidStore(raw, valid);
  return valid;
}

async function quarantineInvalidStore(raw: string, valid: readonly StoredBscTransaction[]): Promise<void> {
  await AsyncStorage.setItem(RECOVERY_KEY, raw).catch(() => undefined);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
}

async function mutate(
  operation: (transactions: StoredBscTransaction[]) => StoredBscTransaction[],
): Promise<void> {
  const queued = mutationQueue.then(async () => {
    const next = operation(await readAll());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  });
  mutationQueue = queued.catch(() => undefined);
  return queued;
}

function assertTransaction(value: unknown): StoredBscTransaction {
  const transaction = value as Partial<StoredBscTransaction>;
  if (
    transaction.version !== 1
    || !HASH_PATTERN.test(transaction.hash ?? '')
    || (transaction.chainId !== 56 && transaction.chainId !== 97)
    || typeof transaction.walletId !== 'string' || !transaction.walletId
    || (transaction.asset !== 'BNB' && transaction.asset !== 'USDT_BEP20')
    || !ADDRESS_PATTERN.test(transaction.from ?? '')
    || !ADDRESS_PATTERN.test(transaction.to ?? '')
    || !isUnsignedInteger(transaction.amountBaseUnits)
    || !isUnsignedInteger(transaction.maximumFeeWei)
    || (transaction.gasLimit !== undefined && !isPositiveInteger(transaction.gasLimit))
    || (transaction.gasPriceWei !== undefined && !isPositiveInteger(transaction.gasPriceWei))
    || ((transaction.gasLimit === undefined) !== (transaction.gasPriceWei === undefined))
    || !Number.isSafeInteger(transaction.nonce) || transaction.nonce! < 0
    || !['pending', 'confirmed', 'failed', 'dropped', 'replaced'].includes(transaction.status ?? '')
    || !isIsoDate(transaction.createdAt)
    || !isIsoDate(transaction.updatedAt)
    || (transaction.blockNumber !== undefined && !isUnsignedInteger(transaction.blockNumber))
    || (transaction.replacementHash !== undefined && !HASH_PATTERN.test(transaction.replacementHash))
    || (transaction.failureCode !== undefined && !/^[A-Z0-9_]{1,64}$/.test(transaction.failureCode))
    || (transaction.energyOrderId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transaction.energyOrderId))
    || (transaction.energyPaymentAttachedAt !== undefined && (
      !isIsoDate(transaction.energyPaymentAttachedAt)
      || transaction.status !== 'confirmed'
      || transaction.asset !== 'USDT_BEP20'
      || !transaction.energyOrderId
    ))
  ) {
    throw new Error('bsc_transaction_store_invalid');
  }
  if (transaction.status === 'replaced' && !transaction.replacementHash) {
    throw new Error('bsc_transaction_store_invalid');
  }
  return Object.freeze({ ...transaction }) as StoredBscTransaction;
}

function isUnsignedInteger(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value);
}

function isPositiveInteger(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}
