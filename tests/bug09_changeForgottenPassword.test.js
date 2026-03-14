/**
 * BUG #9 – models/Users/statics.js  (changeForgottenPassword)
 * ORIGINAL:  const userId = JSON.parse(decryptData(encryption));
 *            → SyntaxError because decryptData returns a plain ID string, not JSON
 *
 * FIX:       const userId = decryptData(encryption);
 */

// ─── Simulate encrypt / decrypt (XOR toy cipher for test purposes) ───────────
function encryptData(plain) {
  // In production this uses a real cipher; here we just return a "ciphertext"
  return Buffer.from(plain).toString('base64');
}

function decryptData(cipher) {
  return Buffer.from(cipher, 'base64').toString('utf8');
}

// ─── Original (buggy): wraps decrypted plain string in JSON.parse ─────────────
function originalChangeForgottenPassword(encryption) {
  const userId = JSON.parse(decryptData(encryption)); // SyntaxError if plain ID
  return userId;
}

// ─── Fixed: use the decrypted string directly ────────────────────────────────
function fixedChangeForgottenPassword(encryption) {
  const userId = decryptData(encryption); // plain string ID
  return userId;
}

describe('Bug #9 – changeForgottenPassword: JSON.parse on plain ID string', () => {
  const rawId  = '6601aabbcc001122334455ff'; // plain MongoDB ObjectId string
  const encrypted = encryptData(rawId);

  test('[original BUG] JSON.parse on a plain ID throws SyntaxError', () => {
    expect(() => originalChangeForgottenPassword(encrypted)).toThrow(SyntaxError);
  });

  test('[FIXED] decryptData returns the raw ID without JSON.parse', () => {
    const result = fixedChangeForgottenPassword(encrypted);
    expect(result).toBe(rawId);
  });

  test('[FIXED] result is a valid-length ObjectId string (24 hex chars)', () => {
    const result = fixedChangeForgottenPassword(encrypted);
    expect(result).toMatch(/^[0-9a-f]{24}$/i);
  });

  test('[FIXED] does NOT throw for any valid base64-encoded ID string', () => {
    const ids = [
      '507f1f77bcf86cd799439011',
      '000000000000000000000000',
      'aabbccddeeff001122334455',
    ];
    ids.forEach((id) => {
      const enc = encryptData(id);
      expect(() => fixedChangeForgottenPassword(enc)).not.toThrow();
      expect(fixedChangeForgottenPassword(enc)).toBe(id);
    });
  });
});
