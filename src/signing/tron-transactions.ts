/**
 * Curated transparency snapshot of TRONOXA's local TRON signing and broadcast path.
 * Balance, pricing, swap, provider, UI, and product-specific helpers are intentionally excluded.
 * The included security-relevant blocks preserve their production logic.
 */
import { TronWeb } from 'tronweb';
import { TRON_DERIVATION_PATH } from '../wallet/types';
import {
  recoverableSignedTransaction,
  type SignedTransactionCallback,
} from './signed-transaction';

// `||` (not `??`) deliberately: an .env file with `EXPO_PUBLIC_TRON_FULL_NODE=`
// (present but empty, as opposed to unset) sets these to '', and '' ?? fallback
// still evaluates to '' since '' is neither null nor undefined — silently
// breaking the default. A contract address / node URL is never validly empty.
const FULL_NODE = process.env.EXPO_PUBLIC_TRON_FULL_NODE || 'https://api.trongrid.io';

const tronWeb = new TronWeb({ fullHost: FULL_NODE });
const tronWebAny = tronWeb as any;

export class MultisigSignaturesRequiredError extends Error {
  constructor(
    public readonly transaction: Record<string, any>,
    public readonly permissionId: number,
    public readonly currentWeight: number,
    public readonly threshold: number,
  ) {
    super(`Additional signatures required (${currentWeight}/${threshold})`);
    this.name = 'MultisigSignaturesRequiredError';
  }
}

export async function assertSufficientMultisigTrxBalance(
  transaction: Record<string, any>,
): Promise<void> {
  const contract = transaction?.raw_data?.contract?.[0];
  const value = contract?.parameter?.value ?? {};
  const ownerRaw = String(value.owner_address ?? '');
  if (!ownerRaw) throw new Error('multisig_balance_owner_missing');
  const ownerAddress = ownerRaw.startsWith('41') && ownerRaw.length === 42
    ? TronWeb.address.fromHex(ownerRaw)
    : ownerRaw;
  if (!TronWeb.isAddress(ownerAddress)) throw new Error('multisig_balance_owner_invalid');

  const params = await withTimeout<any[]>(
    tronWebAny.trx.getChainParameters(),
    15_000,
    'multisig_fee_parameters',
  );
  const chainValue = (key: string) => Number(params.find((item) => item.key === key)?.value ?? 0);
  const permissionId = Number(contract?.Permission_id ?? contract?.permission_id ?? 0);
  const signatureCount = Array.isArray(transaction?.signature) ? transaction.signature.length : 0;
  const type = String(contract?.type ?? contract?.parameter?.type_url?.split('.').pop() ?? '');

  let requiredSun = 0;
  if (permissionId > 0 || signatureCount > 1) {
    requiredSun += chainValue('getMultiSignFee');
  }
  if (type === 'TransferContract') {
    requiredSun += Math.max(0, Number(value.amount ?? 0));
  } else if (type === 'AccountPermissionUpdateContract') {
    requiredSun += chainValue('getUpdateAccountPermissionFee');
  } else if (type === 'TriggerSmartContract') {
    requiredSun += Math.max(0, Number(value.call_value ?? 0));
  }

  const balanceSun = await withTimeout<number>(
    tronWeb.trx.getBalance(ownerAddress),
    15_000,
    'multisig_trx_balance',
  );
  if (!Number.isFinite(balanceSun) || balanceSun < requiredSun) {
    const requiredTrx = requiredSun / 1_000_000;
    const balanceTrx = Number.isFinite(balanceSun) ? balanceSun / 1_000_000 : 0;
    throw new Error(
      `Insufficient TRX balance. The transaction account needs ${requiredTrx.toFixed(6)} TRX but has ${balanceTrx.toFixed(6)} TRX, including the multi-sign fee.`,
    );
  }
}

/** Races a promise against a timeout so a stuck network call fails loudly instead of hanging the UI forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), ms)),
  ]);
}

const SIGNING_SECRET_PREFIX = 'tronoxa-signing:';

export function secretForWalletSigning(
  secret: string,
  derivationPath?: string,
): string {
  if (!derivationPath || derivationPath === TRON_DERIVATION_PATH) return secret;
  return `${SIGNING_SECRET_PREFIX}${JSON.stringify({
    mnemonic: secret,
    derivationPath,
  })}`;
}

export function privateKeyFromSecret(secret: string): string {
  const trimmed = secret.trim();
  if (/^(?:0x)?[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.replace(/^0x/, '');
  }

  let mnemonic = trimmed;
  let derivationPath = TRON_DERIVATION_PATH;
  if (trimmed.startsWith(SIGNING_SECRET_PREFIX)) {
    try {
      const envelope = JSON.parse(trimmed.slice(SIGNING_SECRET_PREFIX.length)) as {
        mnemonic?: unknown;
        derivationPath?: unknown;
      };
      if (
        typeof envelope.mnemonic !== 'string'
        || typeof envelope.derivationPath !== 'string'
        || !/^m\/44'\/195'\/0'\/0\/\d+$/.test(envelope.derivationPath)
      ) {
        throw new Error('invalid_signing_secret');
      }
      mnemonic = envelope.mnemonic;
      derivationPath = envelope.derivationPath;
    } catch {
      throw new Error('invalid_signing_secret');
    }
  }

  const normalized = mnemonic.toLowerCase().replace(/\s+/g, ' ');
  const account = TronWeb.fromMnemonic(normalized, derivationPath);
  if (!account.privateKey) throw new Error('private_key_derivation_failed');
  return account.privateKey.replace(/^0x/, '');
}

export async function sendTrxPayment(
  to: string,
  amountTrx: string,
  secret: string,
  onSigned?: SignedTransactionCallback,
  permissionId = 0,
): Promise<string> {
  const privateKey = privateKeyFromSecret(secret);
  const sun = Math.round(Number(amountTrx) * 1_000_000);
  if (!TronWeb.isAddress(to) || !Number.isFinite(sun) || sun <= 0) throw new Error('invalid_payment');
  const owner = TronWeb.address.fromPrivateKey(privateKey);
  if (!owner) throw new Error('invalid_payment_owner');
  const unsigned = await tronWebAny.transactionBuilder.sendTrx(
    to,
    sun,
    owner,
    permissionId > 0 ? { permissionId } : {},
  );
  const signed = await signWithPermission(unsigned as any, privateKey, permissionId);
  const txId = String((signed as any)?.txID ?? (unsigned as any)?.txID ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txId)) throw new Error('transaction_sign_failed');

  // Persist the deterministic signed TXID before the first broadcast attempt.
  // If the node accepts the transaction but its response is lost, recovery can
  // reconcile this exact transaction instead of creating a second payment.
  if (permissionId === 0) await onSigned?.(txId, recoverableSignedTransaction(signed as any, txId));
  if (permissionId > 0) await assertSufficientMultisigTrxBalance(signed as any);
  const result = await tronWebAny.trx.sendRawTransaction(signed);
  if (!result?.result) throw new Error('trx_broadcast_failed');
  const returnedTxId = String(result.txid ?? txId).toLowerCase();
  if (returnedTxId !== txId) throw new Error('trx_broadcast_txid_mismatch');
  return txId;
}

export async function sendTrc20Transfer(
  to: string,
  amountText: string,
  secret: string,
  contractAddress: string,
  decimals: number,
  symbol = 'TRC20',
  permissionId = 0,
): Promise<string> {
  if (!TronWeb.isAddress(contractAddress)) throw new Error(`missing_${symbol.toLowerCase()}_contract`);
  if (!TronWeb.isAddress(to)) throw new Error(`invalid_${symbol.toLowerCase()}_recipient`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) throw new Error('invalid_token_decimals');

  const amount = parseTokenUnits(amountText, decimals);
  if (BigInt(amount) <= 0n) throw new Error(`invalid_${symbol.toLowerCase()}_transfer`);
  const privateKey = privateKeyFromSecret(secret);
  const owner = TronWeb.address.fromPrivateKey(privateKey);
  if (!owner) throw new Error('invalid_payment_owner');
  const built = await tronWeb.transactionBuilder.triggerSmartContract(
    contractAddress,
    'transfer(address,uint256)',
    { feeLimit: 50_000_000, ...(permissionId > 0 ? { permissionId } : {}) },
    [{ type: 'address', value: to }, { type: 'uint256', value: amount }],
    owner,
  );
  if (!built?.result?.result || !built.transaction) throw new Error(`${symbol.toLowerCase()}_build_failed`);
  const signed = await signWithPermission(built.transaction as any, privateKey, permissionId);
  if (permissionId > 0) await assertSufficientMultisigTrxBalance(signed as any);
  const result = await tronWeb.trx.sendRawTransaction(signed as any);
  if (!result?.result) throw new Error(`${symbol.toLowerCase()}_broadcast_failed`);
  return String(result.txid ?? (signed as any).txID);
}

async function signWithPermission(
  transaction: Record<string, any>,
  privateKey: string,
  permissionId: number,
): Promise<Record<string, any>> {
  const signed = permissionId > 0
    ? await tronWebAny.trx.multiSign(transaction, privateKey, permissionId)
    : await tronWebAny.trx.sign(transaction, privateKey);
  if (typeof signed === 'string') throw new Error('transaction_sign_failed');
  const weight = await tronWebAny.trx.getSignWeight(signed);
  const currentWeight = Number(weight.current_weight ?? 0);
  const threshold = Number(weight.permission?.threshold ?? 0);
  if (threshold > 0 && currentWeight < threshold) {
    throw new MultisigSignaturesRequiredError(signed as any, permissionId, currentWeight, threshold);
  }
  return signed as any;
}

function parseTokenUnits(value: string, decimals: number): string {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error('invalid_token_amount');
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) throw new Error('too_many_decimal_places');
  const units = `${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '');
  return units || '0';
}
