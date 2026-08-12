import { BscError } from '../errors/bsc-error.js';
export const EVM_DECIMALS = 18;
export const UINT256_MAX = (1n << 256n) - 1n;
export function parseUnitsStrict(value, decimals = EVM_DECIMALS) {
    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
        throw new BscError('INVALID_AMOUNT', 'Decimals must be an integer from 0 through 255');
    }
    if (value !== value.trim() || !/^(?:0|[1-9]\d*)(?:\.(\d+))?$/.test(value)) {
        throw new BscError('INVALID_AMOUNT', 'Amount must be an unsigned ASCII decimal string');
    }
    const [whole = '0', fraction = ''] = value.split('.');
    if (fraction.length > decimals) {
        throw new BscError('AMOUNT_PRECISION_EXCEEDED', `Amount exceeds ${decimals} decimal places`);
    }
    const combined = `${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '');
    const units = BigInt(combined || '0');
    if (units > UINT256_MAX) {
        throw new BscError('AMOUNT_OVERFLOW', 'Amount exceeds uint256');
    }
    return units;
}
export function formatUnitsStrict(value, decimals = EVM_DECIMALS) {
    if (value < 0n || value > UINT256_MAX) {
        throw new BscError('INVALID_AMOUNT', 'Amount must be an unsigned uint256 value');
    }
    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
        throw new BscError('INVALID_AMOUNT', 'Decimals must be an integer from 0 through 255');
    }
    if (decimals === 0)
        return value.toString();
    const padded = value.toString().padStart(decimals + 1, '0');
    const whole = padded.slice(0, -decimals);
    const fraction = padded.slice(-decimals).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole;
}
export const parseBnb = (value) => parseUnitsStrict(value, 18);
export const formatBnb = (value) => formatUnitsStrict(value, 18);
export const parseBscUsdt = (value) => parseUnitsStrict(value, 18);
export const formatBscUsdt = (value) => formatUnitsStrict(value, 18);
//# sourceMappingURL=amounts.js.map