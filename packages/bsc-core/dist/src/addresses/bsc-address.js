import { getAddress } from 'ethers';
import { BscError } from '../errors/bsc-error.js';
const BSC_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export function toChecksumAddress(address) {
    const value = address.trim();
    if (!BSC_ADDRESS.test(value)) {
        throw new BscError('INVALID_BSC_ADDRESS', 'BSC address must be a 20-byte 0x-prefixed hex value');
    }
    try {
        const checksum = getAddress(value.toLowerCase());
        const isLowercaseInput = value === `0x${value.slice(2).toLowerCase()}`;
        if (!isLowercaseInput && value !== checksum) {
            throw new Error('invalid checksum');
        }
        return checksum;
    }
    catch {
        throw new BscError('INVALID_BSC_ADDRESS', 'BSC address has an invalid mixed-case checksum');
    }
}
export function validateBscAddress(address) {
    try {
        toChecksumAddress(address);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=bsc-address.js.map
