import { computeAddress, HDNodeWallet, hexlify, Mnemonic, wordlists } from 'ethers';
import { BscError } from '../errors/bsc-error.js';
export const BSC_DERIVATION_PATH_PREFIX = "m/44'/60'/0'/0";
export const MAX_ACCOUNT_INDEX = 0x7fffffff;
export function bscDerivationPath(accountIndex) {
    if (!Number.isSafeInteger(accountIndex) || accountIndex < 0 || accountIndex > MAX_ACCOUNT_INDEX) {
        throw new BscError('INVALID_ACCOUNT_INDEX', 'BSC account index must be a non-negative 31-bit integer');
    }
    return `${BSC_DERIVATION_PATH_PREFIX}/${accountIndex}`;
}
function normalizeMnemonic(mnemonic) {
    return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function validateMnemonic(mnemonic) {
    const normalized = normalizeMnemonic(mnemonic);
    const wordCount = normalized ? normalized.split(' ').length : 0;
    return (wordCount === 12 || wordCount === 24)
        && Mnemonic.isValidMnemonic(normalized, wordlists.en);
}
export function deriveBscAddressFromMnemonic(mnemonic, accountIndex, options = {}) {
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) {
        throw new BscError('INVALID_MNEMONIC', 'Mnemonic must be a valid 12- or 24-word English BIP-39 phrase');
    }
    return HDNodeWallet.fromPhrase(normalized, options.passphrase ?? '', bscDerivationPath(accountIndex), wordlists.en).address;
}
export function deriveBscAddressFromPrivateKey(privateKeyBytes) {
    if (privateKeyBytes.length !== 32) {
        throw new BscError('INVALID_PRIVATE_KEY', 'Private key must contain exactly 32 bytes');
    }
    try {
        return computeAddress(hexlify(privateKeyBytes));
    }
    catch {
        throw new BscError('INVALID_PRIVATE_KEY', 'Private key is outside the secp256k1 scalar range');
    }
}
export function accountIndexFromTronDerivationPath(path) {
    const match = /^m\/44'\/195'\/0'\/0\/(\d+)$/.exec(path);
    if (!match) {
        throw new BscError('INVALID_ACCOUNT_INDEX', 'TRON derivation path is not supported');
    }
    const accountIndex = Number(match[1]);
    bscDerivationPath(accountIndex);
    return accountIndex;
}
//# sourceMappingURL=derivation.js.map
