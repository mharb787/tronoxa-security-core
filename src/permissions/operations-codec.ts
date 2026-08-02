const OPERATIONS_BYTES = 32;
const HEX_LENGTH = OPERATIONS_BYTES * 2;

export function encodeOperations(contractTypeIds: readonly number[]): string {
  const bytes = new Uint8Array(OPERATIONS_BYTES);
  for (const id of contractTypeIds) {
    if (!Number.isInteger(id) || id < 0 || id >= OPERATIONS_BYTES * 8) {
      throw new Error(`Unsupported TRON operation: ${id}.`);
    }
    bytes[Math.floor(id / 8)] |= 1 << (id % 8);
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function decodeOperations(hex: string): number[] {
  const normalized = normalizeOperations(hex);
  const ids: number[] = [];
  for (let byteIndex = 0; byteIndex < OPERATIONS_BYTES; byteIndex += 1) {
    const value = Number.parseInt(normalized.slice(byteIndex * 2, byteIndex * 2 + 2), 16);
    for (let bit = 0; bit < 8; bit += 1) {
      if ((value & (1 << bit)) !== 0) ids.push(byteIndex * 8 + bit);
    }
  }
  return ids;
}

export function normalizeOperations(hex: string): string {
  const value = String(hex ?? '').trim().replace(/^0x/i, '').toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${HEX_LENGTH}}$`).test(value)) {
    throw new Error('Allowed operations must be exactly 32 bytes.');
  }
  return value;
}

export function operationAllowed(hex: string | undefined, contractTypeId: number): boolean {
  if (!hex) return false;
  return decodeOperations(hex).includes(contractTypeId);
}
