import { Buffer } from 'buffer';
import { createCipheriv, createDecipheriv } from 'crypto';
import type { WalletAccount } from './types';

const ALGORITHM = 'aes-256-gcm';
const AAD = Buffer.from('tronoxa-wallet-vault-v2', 'utf8');
export const WALLET_VAULT_VERSION = 2;

export type WalletVault = {
  version: typeof WALLET_VAULT_VERSION;
  index: string[];
  activeWalletId: string | null;
  metadata: Record<string, WalletAccount>;
  secrets: Record<string, string>;
};

type EncryptedWalletVault = {
  version: typeof WALLET_VAULT_VERSION;
  algorithm: typeof ALGORITHM;
  iv: string;
  ciphertext: string;
  tag: string;
};

export type WalletVaultBootstrapMode =
  | 'open'
  | 'resume'
  | 'reinstall'
  | 'migrate'
  | 'discard-pending'
  | 'invalid';

export function classifyWalletVaultBootstrap(input: {
  hasVault: boolean;
  hasPendingVault: boolean;
  hasKey: boolean;
}): WalletVaultBootstrapMode {
  if (input.hasVault) return input.hasKey ? 'open' : 'invalid';
  if (input.hasPendingVault) return input.hasKey ? 'resume' : 'discard-pending';
  return input.hasKey ? 'reinstall' : 'migrate';
}

export function emptyWalletVault(): WalletVault {
  return {
    version: WALLET_VAULT_VERSION,
    index: [],
    activeWalletId: null,
    metadata: {},
    secrets: {},
  };
}

export function cloneWalletVault(vault: WalletVault): WalletVault {
  return JSON.parse(JSON.stringify(vault)) as WalletVault;
}

export function createWalletVaultKey(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64');
}

export function encryptWalletVault(vault: WalletVault, encodedKey: string): string {
  const key = decodeKey(encodedKey);
  const ivBytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(ivBytes);
  const iv = Buffer.from(ivBytes);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(assertWalletVault(vault)), 'utf8'),
    cipher.final(),
  ]);
  const envelope: EncryptedWalletVault = {
    version: WALLET_VAULT_VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
  return JSON.stringify(envelope);
}

export function decryptWalletVault(value: string, encodedKey: string): WalletVault {
  const key = decodeKey(encodedKey);
  const envelope = JSON.parse(value) as Partial<EncryptedWalletVault>;
  if (
    envelope.version !== WALLET_VAULT_VERSION
    || envelope.algorithm !== ALGORITHM
    || typeof envelope.iv !== 'string'
    || typeof envelope.ciphertext !== 'string'
    || typeof envelope.tag !== 'string'
  ) {
    throw new Error('wallet_vault_envelope_invalid');
  }
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('wallet_vault_envelope_invalid');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return assertWalletVault(JSON.parse(plaintext));
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('wallet_vault_key_invalid');
  return key;
}

function assertWalletVault(value: unknown): WalletVault {
  const vault = value as Partial<WalletVault>;
  if (
    vault?.version !== WALLET_VAULT_VERSION
    || !Array.isArray(vault.index)
    || !vault.index.every((id) => typeof id === 'string' && id.length > 0)
    || (vault.activeWalletId !== null && typeof vault.activeWalletId !== 'string')
    || !isRecord(vault.metadata)
    || !isRecord(vault.secrets)
    || !Object.values(vault.secrets).every((secret) => typeof secret === 'string')
  ) {
    throw new Error('wallet_vault_payload_invalid');
  }
  return cloneWalletVault(vault as WalletVault);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
