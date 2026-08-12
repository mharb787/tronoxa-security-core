import { Buffer } from 'buffer';
import type { WalletAccount } from '../wallet/types';
import { loadBscCore, type TronoxaBscCore } from './adapter';
import { extractAuthorizedMnemonic } from './signer-session';

export async function deriveBscAddressForWallet(
  wallet: WalletAccount,
  secret: string | null,
  injectedCore?: TronoxaBscCore,
): Promise<string> {
  const core = injectedCore ?? await loadBscCore();

  if (wallet.type === 'watch_only' || wallet.isWatchOnly) {
    const explicitAddress = wallet.networkAddresses?.bsc;
    if (!explicitAddress) throw new Error('bsc_watch_only_address_missing');
    if (!core.validateBscAddress(explicitAddress)) throw new Error('bsc_watch_only_address_invalid');
    return core.toChecksumAddress(explicitAddress);
  }
  if (!secret) throw new Error('bsc_wallet_secret_missing');

  if (wallet.type === 'mnemonic') {
    if (!wallet.derivationPath) throw new Error('bsc_derivation_path_missing');
    const mnemonic = extractAuthorizedMnemonic(secret, wallet.derivationPath);
    const accountIndex = core.accountIndexFromTronDerivationPath(wallet.derivationPath);
    return core.deriveBscAddressFromMnemonic(mnemonic, accountIndex);
  }

  if (wallet.type === 'private_key') {
    const normalized = secret.trim().replace(/^0x/, '');
    if (!/^[0-9a-fA-F]{64}$/.test(normalized)) throw new Error('bsc_private_key_invalid');
    const keyBytes = Uint8Array.from(Buffer.from(normalized, 'hex'));
    try {
      return core.deriveBscAddressFromPrivateKey(keyBytes);
    } finally {
      keyBytes.fill(0);
    }
  }

  throw new Error('bsc_wallet_type_unsupported');
}
