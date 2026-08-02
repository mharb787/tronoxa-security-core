import { Buffer } from 'buffer';
import { pbkdf2 } from 'crypto';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'tronoxa.security.pin.v1';
const ATTEMPTS_KEY = 'tronoxa.security.pin-attempts.v1';
const BIOMETRICS_KEY = 'tronoxa.security.biometrics.v1';
// crypto-browserify runs on the React Native JS runtime. Keep this asynchronous
// so PIN creation never blocks navigation or freezes Expo Go.
const ITERATIONS = 2_000;
const SHORT_RETRY_DELAY_MS = 2_000;
const FIVE_ATTEMPT_LOCK_MS = 60_000;
const TEN_ATTEMPT_LOCK_MS = 5 * 60_000;
const FIFTEEN_ATTEMPT_LOCK_MS = 30 * 60_000;
const LONG_LOCK_MS = 3 * 60 * 60_000;
export const APP_PIN_LENGTH = 6;
export const LEGACY_APP_PIN_LENGTH = 4;

type PinRecord = {
  salt: string;
  hash: string;
  iterations: number;
  pinLength?: number;
  version?: number;
};
type AttemptRecord = { failed: number; lockedUntil: number };

export type PinAttemptState = {
  failedAttempts: number;
  lockedUntil: number;
};

export type PinVerificationResult = PinAttemptState & {
  ok: boolean;
  remainingAttempts?: number;
};

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export function isValidPin(pin: string) {
  return isPinOfLength(pin, APP_PIN_LENGTH);
}

export async function hasAppPin() {
  return Boolean(await SecureStore.getItemAsync(PIN_KEY));
}

export async function getAppPinStatus(): Promise<'missing' | 'legacy' | 'current'> {
  const raw = await SecureStore.getItemAsync(PIN_KEY);
  if (!raw) return 'missing';
  try {
    const record = JSON.parse(raw) as PinRecord;
    if (!record.salt || !record.hash) return 'legacy';
    return record.pinLength === APP_PIN_LENGTH ? 'current' : 'legacy';
  } catch {
    return 'legacy';
  }
}

export async function setAppPin(pin: string) {
  if (!isValidPin(pin)) throw new Error('invalid_pin');
  const salt = randomSalt();
  const hash = await derive(pin, salt, ITERATIONS);
  const record: PinRecord = {
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    iterations: ITERATIONS,
    pinLength: APP_PIN_LENGTH,
    version: 2,
  };
  await SecureStore.setItemAsync(PIN_KEY, JSON.stringify(record), secureOptions);
  await resetAppPinAttempts();
}

export async function getAppPinAttemptState(): Promise<PinAttemptState> {
  const attempts = await readAttempts();
  return {
    failedAttempts: attempts.failed,
    lockedUntil: attempts.lockedUntil > Date.now() ? attempts.lockedUntil : 0,
  };
}

export function getPinLockDurationMs(failedAttempts: number) {
  if (failedAttempts <= 0) return 0;
  if (failedAttempts === 5) return FIVE_ATTEMPT_LOCK_MS;
  if (failedAttempts === 10) return TEN_ATTEMPT_LOCK_MS;
  if (failedAttempts === 15) return FIFTEEN_ATTEMPT_LOCK_MS;
  if (failedAttempts >= 20 && failedAttempts % 5 === 0) return LONG_LOCK_MS;
  return SHORT_RETRY_DELAY_MS;
}

export async function verifyAppPin(pin: string): Promise<PinVerificationResult> {
  const raw = await SecureStore.getItemAsync(PIN_KEY);
  if (!raw) return { ok: false, failedAttempts: 0, lockedUntil: 0, remainingAttempts: 0 };

  const attempts = await readAttempts();
  if (attempts.lockedUntil > Date.now()) {
    return {
      ok: false,
      failedAttempts: attempts.failed,
      lockedUntil: attempts.lockedUntil,
    };
  }

  try {
    const record = JSON.parse(raw) as PinRecord;
    const expectedLength = record.pinLength === APP_PIN_LENGTH
      ? APP_PIN_LENGTH
      : LEGACY_APP_PIN_LENGTH;
    if (!isPinOfLength(pin, expectedLength)) {
      return {
        ok: false,
        failedAttempts: attempts.failed,
        lockedUntil: 0,
        remainingAttempts: attemptsUntilNextExtendedLock(attempts.failed),
      };
    }

    const salt = Buffer.from(record.salt, 'base64');
    const expected = Buffer.from(record.hash, 'base64');
    const actual = await derive(pin, salt, record.iterations || ITERATIONS);
    if (constantTimeEqual(expected, actual)) {
      await resetAppPinAttempts();
      // Upgrade PINs created by earlier, slower builds after their first
      // successful verification. The verified action must not wait for the
      // replacement record to be derived and written to SecureStore.
      if (record.iterations !== ITERATIONS && expectedLength === APP_PIN_LENGTH) {
        void setAppPin(pin).catch(() => undefined);
      }
      return { ok: true, failedAttempts: 0, lockedUntil: 0 };
    }
  } catch {
    return {
      ok: false,
      failedAttempts: attempts.failed,
      lockedUntil: 0,
      remainingAttempts: 0,
    };
  }

  const failedAttempts = attempts.failed + 1;
  const lockedUntil = Date.now() + getPinLockDurationMs(failedAttempts);
  await writeAttempts({ failed: failedAttempts, lockedUntil });
  return {
    ok: false,
    failedAttempts,
    lockedUntil,
    remainingAttempts: attemptsUntilNextExtendedLock(failedAttempts),
  };
}

function attemptsUntilNextExtendedLock(failedAttempts: number) {
  const remainder = failedAttempts % 5;
  return remainder === 0 ? 5 : 5 - remainder;
}
function isPinOfLength(pin: string, length: number) {
  return new RegExp(`^\\d{${length}}$`).test(pin);
}

export async function changeAppPin(currentPin: string, nextPin: string) {
  const verified = await verifyAppPin(currentPin);
  if (!verified.ok) return verified;
  await setAppPin(nextPin);
  return { ok: true } as const;
}

export async function isBiometricsEnabled() {
  return (await SecureStore.getItemAsync(BIOMETRICS_KEY)) === 'true';
}

export async function setBiometricsEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(BIOMETRICS_KEY, enabled ? 'true' : 'false', secureOptions);
}

function derive(pin: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(pin, salt, iterations, 32, 'sha256', (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes);
}

function constantTimeEqual(left: Buffer, right: Buffer) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function readAttempts(): Promise<AttemptRecord> {
  const raw = await SecureStore.getItemAsync(ATTEMPTS_KEY);
  if (!raw) return { failed: 0, lockedUntil: 0 };
  try {
    const parsed = JSON.parse(raw) as AttemptRecord;
    return {
      failed: Math.max(0, Number(parsed.failed) || 0),
      lockedUntil: Math.max(0, Number(parsed.lockedUntil) || 0),
    };
  } catch {
    return { failed: 0, lockedUntil: 0 };
  }
}

async function writeAttempts(value: AttemptRecord) {
  await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify(value), secureOptions);
}

export async function resetAppPinAttempts() {
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY).catch(() => undefined);
}

/** Removes every app-lock value retained by iOS Keychain after uninstall. */
export async function clearAppSecurityStorage(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(PIN_KEY, secureOptions),
    SecureStore.deleteItemAsync(ATTEMPTS_KEY, secureOptions),
    SecureStore.deleteItemAsync(BIOMETRICS_KEY, secureOptions),
  ]);
}
