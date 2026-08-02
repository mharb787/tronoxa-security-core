export type TronPermissionType = 0 | 1 | 2;

export type TronPermissionKey = {
  address: string;
  weight: number;
};

export type TronPermission = {
  type: TronPermissionType;
  id: number;
  permission_name: string;
  threshold: number;
  parent_id?: number;
  operations?: string;
  keys: TronPermissionKey[];
};

export type AccountPermissions = {
  owner: TronPermission;
  witness: TronPermission | null;
  actives: TronPermission[];
};

export type PermissionUpdateDraft = AccountPermissions & {
  ownerAddress: string;
  authorizingPermissionId: number;
};

export type MultisigEnvelope = {
  format: 'tronoxa.multisig.v1';
  network: string;
  ownerAddress: string;
  permissionId: number;
  createdAt: string;
  transaction: Record<string, any>;
};

export type PermissionValidationIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  permissionId?: number;
};
