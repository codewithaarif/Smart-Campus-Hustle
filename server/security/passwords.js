import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    throw new TypeError('Password must be a non-empty string of at most 1024 characters.');
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024
  });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), hash.toString('hex')].join('$');
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return { valid: false, needsRehash: false };
  }
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 6) return { valid: false, needsRehash: false };
    const [, nText, rText, pText, saltHex, hashHex] = parts;
    const n = Number(nText), r = Number(rText), p = Number(pText);
    if (![n, r, p].every(Number.isSafeInteger) || n < 2 || n > 1_048_576 ||
        r < 1 || r > 32 || p < 1 || p > 16 ||
        !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) {
      return { valid: false, needsRehash: false };
    }
    try {
      const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, {
        N: n, r, p, maxmem: 128 * 1024 * 1024
      });
      return { valid: safeEqual(actual.toString('hex'), hashHex), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }
  // Transitional support for old demo accounts. A successful login upgrades the
  // hash to salted scrypt immediately; new accounts must never use SHA-256.
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const legacy = crypto.createHash('sha256').update(password).digest('hex');
    const valid = safeEqual(legacy.toLowerCase(), storedHash.toLowerCase());
    return { valid, needsRehash: valid };
  }
  return { valid: false, needsRehash: false };
}

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(secret || '').toUpperCase().replace(/=+$/g, '').replace(/\s/g, '');
  let bits = '';
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 authenticator secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const output = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    output.push(parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(output);
}

function totpAt(secret, counter) {
  const key = decodeBase32(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret, code, nowMs = Date.now()) {
  if (typeof secret !== 'string' || !secret || !/^\d{6}$/.test(String(code || ''))) return false;
  const currentCounter = Math.floor(nowMs / 30_000);
  try {
    return [-1, 0, 1].some((delta) =>
      safeEqual(totpAt(secret, currentCounter + delta), code)
    );
  } catch {
    return false;
  }
}
