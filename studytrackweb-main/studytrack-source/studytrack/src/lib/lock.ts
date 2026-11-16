/**
 * Optional privacy lock. The PIN is never stored: only a salted PBKDF2 hash.
 * This is a convenience screen that stops casual snooping. It is NOT encryption - anyone
 * with access to the device profile or browser developer tools can still read the data.
 */
const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPin(pin: string): Promise<{ salt: string; hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    salt: toHex(salt.buffer as ArrayBuffer),
    hash: await derive(pin, salt as Uint8Array<ArrayBuffer>),
  };
}

export async function verifyPin(
  pin: string,
  lock: { salt: string; hash: string },
): Promise<boolean> {
  const hash = await derive(pin, fromHex(lock.salt));
  if (hash.length !== lock.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ lock.hash.charCodeAt(i);
  return diff === 0;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
