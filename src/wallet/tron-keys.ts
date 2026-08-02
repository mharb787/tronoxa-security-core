/**
 * Key derivation & validation — runs ON DEVICE ONLY.
 * bip39 for mnemonics, TronWeb for derivation/address.
 * Nothing here may reach the network or logs.
 */
import * as bip39 from 'bip39';
import { TronWeb } from 'tronweb';
import { TRON_DERIVATION_PATH } from './types';

export function generateMnemonic(words: 12 | 24 = 12): string {
  return bip39.generateMnemonic(words === 24 ? 256 : 128);
}

export function validateMnemonic(mnemonic: string): boolean {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  const count = normalized.split(' ').length;
  return (count === 12 || count === 24) && bip39.validateMnemonic(normalized);
}

/** Derives the TRON address at m/44'/195'/0'/0/0 without exposing the key. */
export function addressFromMnemonic(
  mnemonic: string,
  derivationPath = TRON_DERIVATION_PATH,
): string {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  const account = TronWeb.fromMnemonic(normalized, derivationPath);
  return account.address;
}

export function validatePrivateKey(pk: string): boolean {
  const hex = pk.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  try {
    TronWeb.address.fromPrivateKey(hex);
    return true;
  } catch {
    return false;
  }
}

export function addressFromPrivateKey(pk: string): string {
  const hex = pk.trim().replace(/^0x/, '');
  const addr = TronWeb.address.fromPrivateKey(hex);
  if (!addr) throw new Error('invalid_private_key');
  return addr;
}

export function isValidTronAddress(address: string): boolean {
  return TronWeb.isAddress(address);
}
