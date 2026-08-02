import { TronWeb, utils } from 'tronweb';

type Transaction = Record<string, any>;

const MAX_IMPORTED_TRIGGER_FEE_LIMIT_SUN = 100_000_000;
const MAX_PERMISSION_KEYS = 5;
const MAX_ACTIVE_PERMISSIONS = 8;

/**
 * Imported multisig envelopes cross an untrusted clipboard/share boundary.
 * Keep this allowlist deliberately small and reject anything the UI cannot
 * decode completely before a wallet key is opened.
 */
export function assertSafeImportedMultisigTransaction(transaction: Transaction): void {
  assertTransactionIntegrity(transaction);
  const contract = singleContract(transaction);
  const type = contractType(contract);
  const value = contract.parameter?.value ?? {};
  assertAddressValue(value.owner_address, 'multisig_owner_invalid');
  const permissionId = readPermissionId(contract);
  if (!Number.isInteger(permissionId) || permissionId < 0) throw new Error('multisig_permission_invalid');

  if (type === 'TransferContract') {
    assertAddressValue(value.to_address, 'multisig_recipient_invalid');
    if (readInteger(value.amount, 'multisig_amount_invalid') <= 0n) throw new Error('multisig_amount_invalid');
    return;
  }
  if (type === 'TriggerSmartContract') {
    assertAddressValue(value.contract_address, 'multisig_contract_invalid');
    const data = normalizeHex(value.data);
    if (!data.startsWith('a9059cbb') || data.length !== 136) {
      throw new Error('multisig_contract_method_unsupported');
    }
    const recipient = `41${data.slice(32, 72)}`;
    assertAddressValue(recipient, 'multisig_recipient_invalid');
    if (BigInt(`0x${data.slice(72)}`) <= 0n) throw new Error('multisig_amount_invalid');
    assertIntegerEqual(value.call_value ?? 0, 0, 'multisig_call_value_invalid');
    assertIntegerEqual(value.call_token_value ?? 0, 0, 'multisig_token_value_invalid');
    assertIntegerEqual(value.token_id ?? 0, 0, 'multisig_token_id_invalid');
    const feeLimit = readInteger(transaction.raw_data?.fee_limit, 'multisig_fee_limit_invalid');
    if (feeLimit <= 0n || feeLimit > BigInt(MAX_IMPORTED_TRIGGER_FEE_LIMIT_SUN)) {
      throw new Error('multisig_fee_limit_invalid');
    }
    return;
  }
  if (type === 'AccountPermissionUpdateContract') {
    validatePermissionUpdatePayload(value);
    return;
  }
  throw new Error('multisig_contract_type_unsupported');
}

export function describeSafeImportedMultisigTransaction(transaction: Transaction): string[] {
  assertSafeImportedMultisigTransaction(transaction);
  const contract = singleContract(transaction);
  const type = contractType(contract);
  const value = contract.parameter?.value ?? {};
  if (type === 'TransferContract') {
    return [
      `Recipient: ${displayAddress(value.to_address)}`,
      `Amount: ${formatUnits(readInteger(value.amount, 'multisig_amount_invalid'), 6)} TRX`,
    ];
  }
  if (type === 'TriggerSmartContract') {
    const data = normalizeHex(value.data);
    const recipient = `41${data.slice(32, 72)}`;
    const amount = BigInt(`0x${data.slice(72)}`);
    return [
      `Token contract: ${displayAddress(value.contract_address)}`,
      'Method: transfer(address,uint256)',
      `Recipient: ${displayAddress(recipient)}`,
      `Raw token amount: ${amount.toString()} units`,
      `Maximum network fee: ${formatUnits(readInteger(transaction.raw_data.fee_limit, 'multisig_fee_limit_invalid'), 6)} TRX`,
    ];
  }

  const lines = ['DANGER: this transaction changes who controls the account.'];
  appendPermissionReview(lines, 'Owner', value.owner, 0);
  if (value.witness) appendPermissionReview(lines, 'Witness', value.witness, 1);
  (value.actives ?? []).forEach((permission: unknown, index: number) => {
    appendPermissionReview(lines, `Active ${index + 1}`, permission, 2);
  });
  return lines;
}

export function assertTransactionIntegrity(transaction: Transaction): void {
  if (
    !transaction
    || typeof transaction !== 'object'
    || !/^[0-9a-fA-F]{64}$/.test(String(transaction.txID ?? ''))
    || !/^[0-9a-fA-F]+$/.test(String(transaction.raw_data_hex ?? ''))
  ) {
    throw new Error('transaction_integrity_invalid');
  }
  try {
    if (!(utils.transaction as any).txCheck(transaction as any)) {
      throw new Error('transaction_integrity_invalid');
    }
  } catch {
    throw new Error('transaction_integrity_invalid');
  }
}

function singleContract(transaction: Transaction): Record<string, any> {
  const contracts = transaction.raw_data?.contract;
  if (!Array.isArray(contracts) || contracts.length !== 1 || !contracts[0]) {
    throw new Error('transaction_contract_count_invalid');
  }
  return contracts[0];
}

function contractType(contract: Record<string, any>): string {
  return String(contract.type ?? contract.parameter?.type_url?.split('.').pop() ?? '');
}

function readPermissionId(contract: Record<string, any>): number {
  return Number(contract.Permission_id ?? contract.permission_id ?? 0);
}

function addressHex(value: unknown): string {
  if (typeof value !== 'string' || !TronWeb.isAddress(value)) throw new Error('invalid_tron_address');
  return TronWeb.address.toHex(value).toLowerCase();
}

function assertAddressValue(value: unknown, code: string): void {
  try {
    addressHex(value);
  } catch {
    throw new Error(code);
  }
}

function readInteger(value: unknown, code: string): bigint {
  const normalized = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^(0|[1-9]\d*)$/.test(normalized)) throw new Error(code);
  return BigInt(normalized);
}

function assertIntegerEqual(actual: unknown, expected: unknown, code: string): void {
  if (readInteger(actual, code) !== readInteger(expected, code)) throw new Error(code);
}

function normalizeHex(value: unknown): string {
  const normalized = String(value ?? '').replace(/^0x/i, '').toLowerCase();
  if (!normalized || !/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('transaction_hex_invalid');
  }
  return normalized;
}

function canonicalPermission(raw: unknown, expectedType: 0 | 1 | 2): Record<string, unknown> {
  const permission = (raw ?? {}) as Record<string, any>;
  const type = normalizePermissionType(permission.type, expectedType);
  if (type !== expectedType) throw new Error('permission_update_payload_invalid');
  const threshold = Number(permission.threshold);
  if (!Number.isSafeInteger(threshold) || threshold <= 0) throw new Error('permission_update_payload_invalid');
  if (!Array.isArray(permission.keys) || permission.keys.length === 0 || permission.keys.length > MAX_PERMISSION_KEYS) {
    throw new Error('permission_update_payload_invalid');
  }
  const keys = permission.keys.map((key: any) => {
    const weight = Number(key?.weight);
    if (!Number.isSafeInteger(weight) || weight <= 0) throw new Error('permission_update_payload_invalid');
    return { address: addressHex(key?.address), weight };
  }).sort((left, right) => left.address.localeCompare(right.address) || left.weight - right.weight);
  const totalWeight = keys.reduce((sum, key) => sum + key.weight, 0);
  if (threshold > totalWeight) throw new Error('permission_update_payload_invalid');
  const operations = expectedType === 2 ? normalizeOperations(permission.operations) : '';
  const parentId = Number(permission.parent_id ?? permission.parentId ?? 0);
  if (!Number.isSafeInteger(parentId) || parentId !== 0) throw new Error('permission_update_payload_invalid');
  return { type, threshold, operations, keys };
}

function normalizePermissionType(value: unknown, fallback: 0 | 1 | 2): 0 | 1 | 2 {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === 0 || value === '0' || value === 'Owner' || value === 'owner') return 0;
  if (value === 1 || value === '1' || value === 'Witness' || value === 'witness') return 1;
  if (value === 2 || value === '2' || value === 'Active' || value === 'active') return 2;
  throw new Error('permission_update_payload_invalid');
}

function normalizeOperations(value: unknown): string {
  const operations = String(value ?? '').replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(operations)) throw new Error('permission_update_payload_invalid');
  return operations;
}

function validatePermissionUpdatePayload(value: Record<string, any>): void {
  canonicalPermission(value.owner, 0);
  if (value.witness) canonicalPermission(value.witness, 1);
  if (!Array.isArray(value.actives) || value.actives.length > MAX_ACTIVE_PERMISSIONS) {
    throw new Error('permission_update_payload_invalid');
  }
  value.actives.forEach((permission: unknown) => canonicalPermission(permission, 2));
}

function appendPermissionReview(
  lines: string[],
  label: string,
  raw: unknown,
  type: 0 | 1 | 2,
): void {
  const permission = canonicalPermission(raw, type) as any;
  lines.push(`${label}: threshold ${permission.threshold}`);
  permission.keys.forEach((key: { address: string; weight: number }) => {
    lines.push(`${label} key: ${displayAddress(key.address)} · weight ${key.weight}`);
  });
  if (type === 2) lines.push(`${label} operations: ${permission.operations}`);
}

function displayAddress(value: unknown): string {
  return TronWeb.address.fromHex(addressHex(value));
}

function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
