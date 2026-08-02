import { TronWeb } from 'tronweb';
import { Buffer } from 'buffer';
import { normalizeOperations, operationAllowed } from './operations-codec';
import {
  AccountPermissions,
  PermissionValidationIssue,
  TronPermission,
} from './permission-types';

const MAX_KEYS = 5;
const MAX_ACTIVE_PERMISSIONS = 8;

export function validateAccountPermissions(
  permissions: AccountPermissions,
  locallyControlledAddresses: string[] = [],
): PermissionValidationIssue[] {
  const issues: PermissionValidationIssue[] = [];
  if (permissions.actives.length > MAX_ACTIVE_PERMISSIONS) {
    issues.push(error('too_many_active_permissions', `At most ${MAX_ACTIVE_PERMISSIONS} active permissions are allowed.`));
  }
  validatePermission(permissions.owner, issues);
  if (permissions.witness) validatePermission(permissions.witness, issues);
  permissions.actives.forEach((permission) => validatePermission(permission, issues));

  const local = new Set(locallyControlledAddresses.map(normalizeAddress));
  const localOwnerWeight = permissions.owner.keys.reduce(
    (sum, key) => sum + (local.has(normalizeAddress(key.address)) ? key.weight : 0),
    0,
  );
  if (local.size > 0 && localOwnerWeight < permissions.owner.threshold) {
    issues.push({
      code: 'owner_lockout_risk',
      severity: 'warning',
      message: 'Keys stored on this device cannot meet the new owner threshold by themselves.',
      permissionId: 0,
    });
  }
  if (permissions.actives.some((permission) => operationAllowed(permission.operations, 46))) {
    issues.push({
      code: 'active_can_change_permissions',
      severity: 'warning',
      message: 'An active permission can change the account permission structure.',
    });
  }
  return issues;
}

function validatePermission(permission: TronPermission, issues: PermissionValidationIssue[]) {
  if (!Number.isInteger(permission.threshold) || permission.threshold <= 0) {
    issues.push(error('invalid_threshold', 'Threshold must be a positive integer.', permission.id));
  }
  if (!permission.keys.length) issues.push(error('missing_keys', 'A permission must contain at least one key.', permission.id));
  if (permission.keys.length > MAX_KEYS) {
    issues.push(error('too_many_keys', `At most ${MAX_KEYS} keys are allowed in a permission.`, permission.id));
  }
  if (Buffer.byteLength(permission.permission_name, 'utf8') > 32) {
    issues.push(error('name_too_long', 'Permission name must not exceed 32 bytes.', permission.id));
  }
  const seen = new Set<string>();
  let weight = 0;
  permission.keys.forEach((key) => {
    if (!TronWeb.isAddress(key.address)) issues.push(error('invalid_address', `Invalid TRON address: ${key.address}`, permission.id));
    if (!Number.isInteger(key.weight) || key.weight <= 0) issues.push(error('invalid_weight', 'Key weight must be a positive integer.', permission.id));
    const address = normalizeAddress(key.address);
    if (seen.has(address)) issues.push(error('duplicate_key', `Duplicate key: ${key.address}`, permission.id));
    seen.add(address);
    weight += key.weight;
  });
  if (permission.threshold > weight) {
    issues.push(error('unreachable_threshold', 'Threshold is greater than the sum of all key weights.', permission.id));
  }
  if (permission.type === 2) {
    try {
      normalizeOperations(permission.operations ?? '');
    } catch {
      issues.push(error('invalid_operations', 'Active permission operations must be exactly 32 bytes.', permission.id));
    }
  }
}

function normalizeAddress(address: string): string {
  try {
    return TronWeb.address.toHex(address).toLowerCase();
  } catch {
    return address.trim().toLowerCase();
  }
}

function error(code: string, message: string, permissionId?: number): PermissionValidationIssue {
  return { code, severity: 'error', message, permissionId };
}
