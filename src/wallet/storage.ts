/**
 * Encrypted wallet vault.
 *
 * Wallet metadata and secrets live in one AES-256-GCM encrypted AsyncStorage
 * record. iOS/Android delete that record with the app. Keychain holds only the
 * random encryption key, so retaining Keychain after an iOS uninstall cannot
 * restore a wallet without the deleted ciphertext.
 *
 * Existing SecureStore wallets are migrated once, verified, then removed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { WalletAccount } from './types';
import {
  classifyWalletVaultBootstrap,
  cloneWalletVault,
  createWalletVaultKey,
  decryptWalletVault,
  emptyWalletVault,
  encryptWalletVault,
  WalletVault,
} from './vault-codec';

const VAULT_STORAGE_KEY = 'wallets.vault.ciphertext.v2';
const PENDING_VAULT_STORAGE_KEY = 'wallets.vault.pending.v2';
const VAULT_KEY_KEYCHAIN_KEY = 'wallets.vault.key.v2';
const REINSTALL_CLEANUP_PENDING_KEY = 'app.reinstallCleanupPending.v1';

const LEGACY_INDEX_KEY = 'wallets.index.v1';
const LEGACY_ACTIVE_WALLET_KEY = 'wallets.active.v1';
const legacyMeta = (id: string) => `wallet.metadata.${id}`;
const legacySecret = (id: string) => `wallet.secret.${id}`;

const SECRET_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type WalletStorageBootstrapResult = {
  reinstalled: boolean;
  migratedWallets: number;
};

let currentVault: WalletVault | null = null;
let initializationPromise: Promise<WalletStorageBootstrapResult> | null = null;
let mutationQueue: Promise<void> = Promise.resolve();

export function initializeWalletStorage(): Promise<WalletStorageBootstrapResult> {
  if (!initializationPromise) {
    initializationPromise = initializeWalletStorageOnce().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

async function initializeWalletStorageOnce(): Promise<WalletStorageBootstrapResult> {
  let [encryptedVault, pendingVault, encodedKey] = await Promise.all([
    AsyncStorage.getItem(VAULT_STORAGE_KEY),
    AsyncStorage.getItem(PENDING_VAULT_STORAGE_KEY),
    SecureStore.getItemAsync(VAULT_KEY_KEYCHAIN_KEY, SECRET_OPTS),
  ]);

  const mode = classifyWalletVaultBootstrap({
    hasVault: Boolean(encryptedVault),
    hasPendingVault: Boolean(pendingVault),
    hasKey: Boolean(encodedKey),
  });

  if (mode === 'invalid') {
    throw new Error('wallet_vault_key_missing');
  }

  if (mode === 'open') {
    currentVault = decryptWalletVault(encryptedVault!, encodedKey!);
    await AsyncStorage.removeItem(PENDING_VAULT_STORAGE_KEY);
    await deleteLegacyWalletStorage(currentVault.index);
    return { reinstalled: false, migratedWallets: 0 };
  }

  if (mode === 'resume') {
    currentVault = decryptWalletVault(pendingVault!, encodedKey!);
    await AsyncStorage.setItem(VAULT_STORAGE_KEY, pendingVault!);
    await AsyncStorage.removeItem(PENDING_VAULT_STORAGE_KEY);
    await deleteLegacyWalletStorage(currentVault.index);
    return { reinstalled: false, migratedWallets: currentVault.index.length };
  }

  if (mode === 'reinstall') {
    // Persist this in the new sandbox before changing Keychain. If the process
    // stops mid-cleanup, the next launch completes the remaining purge.
    await AsyncStorage.setItem(REINSTALL_CLEANUP_PENDING_KEY, '1');
    const legacyIds = await readLegacyIndex();
    await deleteLegacyWalletStorage(legacyIds);
    await SecureStore.deleteItemAsync(VAULT_KEY_KEYCHAIN_KEY, SECRET_OPTS);
    const bootstrapped = await bootstrapVault(emptyWalletVault());
    currentVault = bootstrapped.vault;
    return { reinstalled: true, migratedWallets: 0 };
  }

  if (mode === 'discard-pending') {
    await AsyncStorage.removeItem(PENDING_VAULT_STORAGE_KEY);
    pendingVault = null;
  }

  const legacyVault = await readLegacyWalletVault();
  const bootstrapped = await bootstrapVault(legacyVault);
  currentVault = bootstrapped.vault;

  // Verify the committed ciphertext before removing a single legacy Keychain
  // entry. If any step above fails, every old wallet remains recoverable.
  encryptedVault = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
  encodedKey = await SecureStore.getItemAsync(VAULT_KEY_KEYCHAIN_KEY, SECRET_OPTS);
  if (!encryptedVault || !encodedKey) throw new Error('wallet_vault_commit_incomplete');
  const verified = decryptWalletVault(encryptedVault, encodedKey);
  assertMigrationComplete(legacyVault, verified);
  await deleteLegacyWalletStorage(legacyVault.index);

  return { reinstalled: false, migratedWallets: legacyVault.index.length };
}

async function bootstrapVault(vault: WalletVault): Promise<{ vault: WalletVault; key: string }> {
  const key = createWalletVaultKey();
  const encrypted = encryptWalletVault(vault, key);

  // Two-phase bootstrap: a process death can either retry with untouched
  // legacy data or resume the pending ciphertext with its committed key.
  await AsyncStorage.setItem(PENDING_VAULT_STORAGE_KEY, encrypted);
  try {
    await SecureStore.setItemAsync(VAULT_KEY_KEYCHAIN_KEY, key, SECRET_OPTS);
    await AsyncStorage.setItem(VAULT_STORAGE_KEY, encrypted);
    await AsyncStorage.removeItem(PENDING_VAULT_STORAGE_KEY);
  } catch (error) {
    await SecureStore.deleteItemAsync(VAULT_KEY_KEYCHAIN_KEY, SECRET_OPTS).catch(() => undefined);
    await AsyncStorage.removeItem(PENDING_VAULT_STORAGE_KEY).catch(() => undefined);
    throw error;
  }

  return { vault: decryptWalletVault(encrypted, key), key };
}

async function getVault(): Promise<WalletVault> {
  await initializeWalletStorage();
  if (!currentVault) throw new Error('wallet_vault_not_initialized');
  return currentVault;
}

async function mutateVault(change: (next: WalletVault) => void): Promise<void> {
  const operation = mutationQueue.then(async () => {
    const next = cloneWalletVault(await getVault());
    change(next);
    const key = await SecureStore.getItemAsync(VAULT_KEY_KEYCHAIN_KEY, SECRET_OPTS);
    if (!key) throw new Error('wallet_vault_key_missing');
    const encrypted = encryptWalletVault(next, key);
    await AsyncStorage.setItem(VAULT_STORAGE_KEY, encrypted);
    currentVault = decryptWalletVault(encrypted, key);
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function readIndex(): Promise<string[]> {
  return [...(await getVault()).index];
}

async function writeIndex(ids: string[]): Promise<void> {
  await mutateVault((vault) => {
    vault.index = [...new Set(ids)];
  });
}

export async function readActiveWalletId(): Promise<string | null> {
  return (await getVault()).activeWalletId;
}

export async function writeActiveWalletId(id: string | null): Promise<void> {
  await mutateVault((vault) => {
    vault.activeWalletId = id;
  });
}

export async function readMetadata(id: string): Promise<WalletAccount | null> {
  const value = (await getVault()).metadata[id];
  return value ? JSON.parse(JSON.stringify(value)) as WalletAccount : null;
}

export async function writeMetadata(wallet: WalletAccount): Promise<void> {
  await mutateVault((vault) => {
    vault.metadata[wallet.id] = JSON.parse(JSON.stringify(wallet)) as WalletAccount;
    if (!vault.index.includes(wallet.id)) vault.index.push(wallet.id);
  });
}

export async function writeSecret(id: string, value: string): Promise<void> {
  await mutateVault((vault) => {
    vault.secrets[id] = value;
  });
}

export async function readSecret(id: string): Promise<string | null> {
  return (await getVault()).secrets[id] ?? null;
}

export async function removeWallet(id: string): Promise<void> {
  await mutateVault((vault) => {
    if (vault.activeWalletId === id) vault.activeWalletId = null;
    delete vault.metadata[id];
    delete vault.secrets[id];
    vault.index = vault.index.filter((walletId) => walletId !== id);
  });
}

async function readLegacyIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(LEGACY_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
      throw new Error('legacy_wallet_index_invalid');
    }
    return [...new Set(parsed)];
  } catch {
    throw new Error('legacy_wallet_index_invalid');
  }
}

async function readLegacyWalletVault(): Promise<WalletVault> {
  const index = await readLegacyIndex();
  const vault = emptyWalletVault();
  vault.index = index;
  vault.activeWalletId = await SecureStore.getItemAsync(LEGACY_ACTIVE_WALLET_KEY);

  for (const id of index) {
    const [rawMetadata, storedSecret] = await Promise.all([
      SecureStore.getItemAsync(legacyMeta(id)),
      SecureStore.getItemAsync(legacySecret(id), SECRET_OPTS),
    ]);
    if (!rawMetadata) throw new Error(`legacy_wallet_metadata_missing:${id}`);
    try {
      vault.metadata[id] = JSON.parse(rawMetadata) as WalletAccount;
    } catch {
      throw new Error(`legacy_wallet_metadata_invalid:${id}`);
    }
    if (storedSecret) vault.secrets[id] = storedSecret;
    if (!vault.metadata[id].isWatchOnly && !storedSecret) {
      throw new Error(`legacy_wallet_secret_missing:${id}`);
    }
  }

  return vault;
}

async function deleteLegacyWalletStorage(ids: string[]): Promise<void> {
  for (const id of ids) {
    await SecureStore.deleteItemAsync(legacySecret(id), SECRET_OPTS).catch(() => undefined);
    await SecureStore.deleteItemAsync(legacyMeta(id)).catch(() => undefined);
  }
  await Promise.all([
    SecureStore.deleteItemAsync(LEGACY_INDEX_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(LEGACY_ACTIVE_WALLET_KEY).catch(() => undefined),
  ]);
}

function assertMigrationComplete(before: WalletVault, after: WalletVault): void {
  if (
    JSON.stringify(before.index) !== JSON.stringify(after.index)
    || before.activeWalletId !== after.activeWalletId
    || JSON.stringify(before.metadata) !== JSON.stringify(after.metadata)
    || JSON.stringify(before.secrets) !== JSON.stringify(after.secrets)
  ) {
    throw new Error('wallet_vault_migration_verification_failed');
  }
}
