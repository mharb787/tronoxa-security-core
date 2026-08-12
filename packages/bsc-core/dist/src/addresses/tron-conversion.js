import { dataSlice, decodeBase58, encodeBase58, getAddress, getBytes, hexlify, sha256, toBeHex, } from 'ethers';
import { BscError } from '../errors/bsc-error.js';
const TRON_ADDRESS_BYTES = 25;
const TRON_MAINNET_PREFIX = 0x41;
function checksum(payload) {
    return getBytes(dataSlice(sha256(sha256(payload)), 0, 4));
}
function constantTimeEqual(left, right) {
    if (left.length !== right.length)
        return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left[index] ^ right[index];
    }
    return difference === 0;
}
export function decodeValidatedTronAddress(tronAddress) {
    const value = tronAddress.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{34}$/.test(value)) {
        throw new BscError('INVALID_TRON_ADDRESS', 'TRON address is not canonical Base58');
    }
    try {
        const decoded = getBytes(toBeHex(decodeBase58(value), TRON_ADDRESS_BYTES));
        if (encodeBase58(decoded) !== value || decoded[0] !== TRON_MAINNET_PREFIX) {
            throw new Error('invalid prefix or encoding');
        }
        const body = decoded.slice(0, 21);
        const providedChecksum = decoded.slice(21);
        if (!constantTimeEqual(providedChecksum, checksum(body))) {
            throw new Error('invalid checksum');
        }
        return decoded;
    }
    catch {
        throw new BscError('INVALID_TRON_ADDRESS', 'TRON Base58Check checksum or prefix is invalid');
    }
}
export function convertValidatedTronAddressToBscAddress(tronAddress) {
    const decoded = decodeValidatedTronAddress(tronAddress);
    return getAddress(hexlify(decoded.slice(1, 21)));
}
//# sourceMappingURL=tron-conversion.js.map