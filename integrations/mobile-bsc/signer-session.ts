import { Buffer } from 'buffer';
import { HDNodeWallet, Wallet, hexlify } from 'ethers';
import type { TransactionSigner } from '@tronoxa/bsc-core';
import type { WalletAccount } from '../wallet/types';
import type { TronoxaBscCore } from './adapter';

const SIGNING_SECRET_PREFIX = 'tronoxa-signing:';

/**
 * Uses only a secret returned by the existing PIN/biometric authorization.
 * The signer is scoped to the callback and is never persisted or returned.
 */
export async function withAuthorizedBscSigner<T>(
  core: TronoxaBscCore,
  wallet: WalletAccount,
  authorizedSecret: string,
  operation: (signer: TransactionSigner) => Promise<T>,
): Promise<T> {
  if (wallet.isWatchOnly || wallet.type === 'watch_only') throw new Error('bsc_watch_only_cannot_sign');
  if (!wallet.networkAddresses?.bsc) throw new Error('bsc_address_not_provisioned');

  let signer: HDNodeWallet | Wallet | null = null;
  let keyBytes: Uint8Array | null = null;
  let transientPrivateKey = '';
  try {
    if (wallet.type === 'mnemonic') {
      if (!wallet.derivationPath) throw new Error('bsc_derivation_path_missing');
      const mnemonic = extractAuthorizedMnemonic(authorizedSecret, wallet.derivationPath);
      if (!core.validateMnemonic(mnemonic)) throw new Error('bsc_mnemonic_invalid');
      const accountIndex = core.accountIndexFromTronDerivationPath(wallet.derivationPath);
      signer = HDNodeWallet.fromPhrase(mnemonic, '', core.bscDerivationPath(accountIndex));
    } else if (wallet.type === 'private_key') {
      const normalized = authorizedSecret.trim().replace(/^0x/, '');
      if (!/^[0-9a-fA-F]{64}$/.test(normalized)) throw new Error('bsc_private_key_invalid');
      keyBytes = Uint8Array.from(Buffer.from(normalized, 'hex'));
      // ethers accepts an immutable hex string; keep it local and release it
      // immediately after constructing the callback-scoped signer.
      transientPrivateKey = hexlify(keyBytes);
      signer = new Wallet(transientPrivateKey);
      transientPrivateKey = '';
    } else {
      throw new Error('bsc_wallet_type_unsupported');
    }

    const expected = core.toChecksumAddress(wallet.networkAddresses.bsc);
    const actual = core.toChecksumAddress(await signer.getAddress());
    if (actual !== expected) throw new Error('bsc_signer_address_mismatch');
    return await operation(signer);
  } finally {
    transientPrivateKey = '';
    keyBytes?.fill(0);
    keyBytes = null;
    signer = null;
  }
}

export function extractAuthorizedMnemonic(secret: string, expectedTronPath: string): string {
  const trimmed = secret.trim();
  if (!trimmed.startsWith(SIGNING_SECRET_PREFIX)) return trimmed;
  try {
    const value = JSON.parse(trimmed.slice(SIGNING_SECRET_PREFIX.length)) as {
      mnemonic?: unknown;
      derivationPath?: unknown;
    };
    if (
      typeof value.mnemonic !== 'string'
      || typeof value.derivationPath !== 'string'
      || value.derivationPath !== expectedTronPath
    ) throw new Error('bsc_signing_secret_path_mismatch');
    return value.mnemonic.trim();
  } catch (error) {
    if (error instanceof Error && error.message === 'bsc_signing_secret_path_mismatch') throw error;
    throw new Error('bsc_signing_secret_invalid');
  }
}
