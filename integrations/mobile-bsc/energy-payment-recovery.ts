import { attachBscPayment, getOrder } from '../lib/api';
import {
  listStoredBscTransactions,
  markStoredBscEnergyPaymentAttached,
  type StoredBscTransaction,
} from './pending-transactions';

type EnergyOrderSnapshot = Readonly<{
  status?: string;
  paymentTxHash?: string | null;
}>;

type RecoveryDependencies = Readonly<{
  list: (walletId: string) => Promise<StoredBscTransaction[]>;
  getOrder: (orderId: string) => Promise<EnergyOrderSnapshot>;
  attach: (orderId: string, hash: string) => Promise<EnergyOrderSnapshot>;
  markAttached: (hash: string) => Promise<unknown>;
}>;

const DEFAULT_DEPENDENCIES: RecoveryDependencies = {
  list: listStoredBscTransactions,
  getOrder,
  attach: attachBscPayment,
  markAttached: markStoredBscEnergyPaymentAttached,
};
const reconciliationInFlight = new Map<string, Promise<void>>();

/**
 * Reconciles confirmed BSC Energy payments without replaying attach POSTs for
 * historical orders. Old app versions left every confirmed transaction in the
 * local store, so checking server state first is also the one-time migration.
 */
export async function reconcileStoredBscEnergyPayments(
  walletId: string,
  dependencies: RecoveryDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const active = reconciliationInFlight.get(walletId);
  if (active) return active;
  const operation = reconcileStoredBscEnergyPaymentsOnce(walletId, dependencies)
    .finally(() => reconciliationInFlight.delete(walletId));
  reconciliationInFlight.set(walletId, operation);
  return operation;
}

async function reconcileStoredBscEnergyPaymentsOnce(
  walletId: string,
  dependencies: RecoveryDependencies,
): Promise<void> {
  const payments = (await dependencies.list(walletId)).filter(isUnattachedEnergyPayment);
  // Sequential processing prevents one foreground refresh from creating a burst.
  for (const payment of payments) {
    await reconcilePayment(payment, dependencies).catch(() => undefined);
  }
}

async function reconcilePayment(
  payment: StoredBscTransaction,
  dependencies: RecoveryDependencies,
): Promise<void> {
  const orderId = payment.energyOrderId!;
  const current = await dependencies.getOrder(orderId);
  const serverHash = normalizedHash(current.paymentTxHash);
  if (serverHash && serverHash !== payment.hash.toLowerCase()) {
    throw new Error('bsc_energy_payment_hash_mismatch');
  }
  if (serverHash && current.status !== 'PAYMENT_PENDING') {
    await dependencies.markAttached(payment.hash);
    return;
  }
  if (serverHash) {
    // The backend already durably knows the hash. A future GET will continue
    // finality recovery, so repeating the attach POST would only consume quota.
    return;
  }
  const attached = await dependencies.attach(orderId, payment.hash);
  const attachedHash = normalizedHash(attached.paymentTxHash);
  if (attachedHash && attachedHash !== payment.hash.toLowerCase()) {
    throw new Error('bsc_energy_payment_hash_mismatch');
  }
  await dependencies.markAttached(payment.hash);
}

function isUnattachedEnergyPayment(transaction: StoredBscTransaction): boolean {
  return transaction.asset === 'USDT_BEP20'
    && transaction.status === 'confirmed'
    && Boolean(transaction.energyOrderId)
    && !transaction.energyPaymentAttachedAt;
}

function normalizedHash(value: unknown): string | null {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
    ? value.toLowerCase()
    : null;
}
