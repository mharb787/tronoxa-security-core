import * as walletRepository from '../wallet/repository';
import * as walletStorage from '../wallet/storage';
import type { WalletAccount } from '../wallet/types';
import { loadBscCore, type TronoxaBscCore } from './adapter';
import { BSC_FEATURE_FLAGS } from './feature-flags';
import { deriveBscAddressForWallet } from './wallet-address';

export type AuthorizedSecretReader = (wallet: WalletAccount) => Promise<string>;

/**
 * Called only from an explicit BSC onboarding flow after app authorization.
 * It never initiates PIN/biometric UI and cannot read the vault secret itself.
 */
export async function provisionBscAddress(
  walletId: string,
  readAuthorizedSecret: AuthorizedSecretReader,
  injectedCore?: TronoxaBscCore,
): Promise<string> {
  if (!BSC_FEATURE_FLAGS.enabled && !injectedCore) throw new Error('bsc_feature_disabled');
  const core = injectedCore ?? await loadBscCore();
  const wallet = await walletRepository.getWallet(walletId);
  if (!wallet) throw new Error('bsc_wallet_not_found');

  const existing = wallet.networkAddresses?.bsc;
  if (existing) {
    if (!core.validateBscAddress(existing)) throw new Error('bsc_stored_address_invalid');
    return core.toChecksumAddress(existing);
  }

  const secret = wallet.isWatchOnly ? null : await readAuthorizedSecret(wallet);
  const address = await deriveBscAddressForWallet(wallet, secret, core);
  const checksummedAddress = core.toChecksumAddress(address);
  wallet.networkAddresses = {
    ...wallet.networkAddresses,
    bsc: checksummedAddress,
  };
  wallet.updatedAt = new Date().toISOString();
  await walletStorage.writeMetadata(wallet);
  return checksummedAddress;
}
