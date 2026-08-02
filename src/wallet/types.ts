/** Multi-wallet model — exactly as specified. */
export type WalletType = 'mnemonic' | 'private_key' | 'watch_only';

export type WalletAccount = {
  id: string;
  name: string;
  type: WalletType;
  address: string;
  /** Reference to the secret's storage key — never the secret itself. */
  encryptedSecretReference?: string;
  derivationPath?: string;
  /** Wallet whose recovery phrase was reused for this derived address. */
  derivationSourceWalletId?: string;
  /** True until a newly generated recovery phrase is verified by the user. */
  needsBackup?: boolean;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  isWatchOnly: boolean;
};

export const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";

export function tronDerivationPath(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error('invalid_derivation_index');
  }
  return `m/44'/195'/0'/0/${index}`;
}

export function canSign(w: WalletAccount): boolean {
  return !w.isWatchOnly && w.type !== 'watch_only';
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
