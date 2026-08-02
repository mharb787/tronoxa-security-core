import { TronWeb, utils, type Types } from 'tronweb';

const TX_ID = /^[0-9a-f]{64}$/;
const HEX = /^[0-9a-f]+$/;
const SIGNATURE = /^[0-9a-f]{130}$/;
const MAX_SERIALIZED_BYTES = 128 * 1024;

/**
 * A signed TRON transaction can authorize only the exact transaction encoded
 * inside it; it contains no mnemonic or private key. Persisting this envelope
 * lets recovery rebroadcast the same transaction instead of ever signing a
 * duplicate after an app interruption.
 */
export type RecoverableSignedTransaction = Types.SignedTransaction;

export type SignedTransactionCallback = (
  txId: string,
  transaction: RecoverableSignedTransaction,
) => Promise<void> | void;

export function recoverableSignedTransaction(
  value: unknown,
  expectedTxId?: string,
): RecoverableSignedTransaction {
  if (!isRecoverableSignedTransaction(value, expectedTxId)) {
    throw new Error('invalid_signed_transaction');
  }
  // Keep only JSON data before it reaches AsyncStorage.
  return JSON.parse(JSON.stringify(value)) as RecoverableSignedTransaction;
}

export function isRecoverableSignedTransaction(
  value: unknown,
  expectedTxId?: string | null,
): value is RecoverableSignedTransaction {
  if (!value || typeof value !== 'object') return false;
  const transaction = value as Partial<RecoverableSignedTransaction>;
  const txId = String(transaction.txID ?? '').toLowerCase();
  const rawData = transaction.raw_data;
  const rawHex = String(transaction.raw_data_hex ?? '').toLowerCase();
  if (
    !TX_ID.test(txId)
    || (
      expectedTxId != null
      && txId !== String(expectedTxId).toLowerCase()
    )
    || typeof transaction.visible !== 'boolean'
    || !rawData
    || typeof rawData !== 'object'
    || !Array.isArray(rawData.contract)
    || rawData.contract.length !== 1
    || !Number.isSafeInteger(rawData.timestamp)
    || Number(rawData.timestamp) <= 0
    || !Number.isSafeInteger(rawData.expiration)
    || Number(rawData.expiration) < Number(rawData.timestamp)
    || rawHex.length === 0
    || rawHex.length % 2 !== 0
    || !HEX.test(rawHex)
    || !Array.isArray(transaction.signature)
    || transaction.signature.length !== 1
    || !transaction.signature.every(
      (signature) =>
        typeof signature === 'string'
        && SIGNATURE.test(signature.toLowerCase()),
    )
  ) {
    return false;
  }
  try {
    if (JSON.stringify(value).length > MAX_SERIALIZED_BYTES) return false;
    const protobuf = utils.transaction.txJsonToPb(transaction);
    const computedTxId = utils.transaction
      .txPbToTxID(protobuf)
      .replace(/^0x/i, '')
      .toLowerCase();
    const computedRawHex = utils.transaction
      .txPbToRawDataHex(protobuf)
      .replace(/^0x/i, '')
      .toLowerCase();
    const ownerAddress = String(
      (rawData.contract[0] as any)?.parameter?.value?.owner_address ?? '',
    );
    const expectedSigner = TronWeb.address.toHex(ownerAddress).toLowerCase();
    const recoveredSigner = utils.crypto
      .ecRecover(computedTxId, transaction.signature[0])
      .toLowerCase();
    return computedTxId === txId
      && computedRawHex === rawHex
      && recoveredSigner === expectedSigner;
  } catch {
    return false;
  }
}
