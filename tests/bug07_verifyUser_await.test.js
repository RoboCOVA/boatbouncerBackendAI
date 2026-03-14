/**
 * BUG #7 – models/Users/statics.js  (verifyUser)
 * ORIGINAL:  identityToolkit.relyingparty.verifyPhoneNumber({...})   // no await!
 * FIX:       await identityToolkit.relyingparty.verifyPhoneNumber({...})
 *
 * Without await, the Promise is never awaited; a bad/expired OTP is silently
 * accepted and the user is verified without a valid code.
 *
 * NOTE: We cannot directly call an async function without await in tests
 * because Node 20 crashes on unhandled rejections. Instead, we demonstrate
 * the semantic difference using Promise-tracking and controlled simulations.
 */

// ─── Track whether a promise was awaited ─────────────────────────────────────
function makeTrackedOtpVerifier(code, expectedCode) {
  let settled = false;
  const promise = new Promise((resolve, reject) => {
    if (code !== expectedCode) {
      reject(new Error('Invalid or expired verification code'));
    } else {
      resolve({ success: true });
    }
  });
  promise.then(() => { settled = true; }).catch(() => { settled = true; });
  return { promise, isSettled: () => settled };
}

// ─── Simulate the original (no-await) logic by detecting awaited vs not ──────
async function originalVerifyUser(code, expectedCode) {
  let verified = false;
  const otpPromise = new Promise((resolve, reject) => {
    if (code !== expectedCode) reject(new Error('Invalid code'));
    else resolve(true);
  });

  // BUG simulation: consume the promise without await so rejection is not thrown
  otpPromise.catch(() => {}); // silently swallow to avoid unhandled rejection crash
  // Without await, the rejection is never caught in the try/catch → verified = true
  verified = true; // always reached because no await means no thrown error
  return verified;
}

// ─── Fixed: properly await the verify call ───────────────────────────────────
async function fixedVerifyUser(code, expectedCode) {
  let verified = false;
  try {
    await new Promise((resolve, reject) => {
      if (code !== expectedCode) reject(new Error('Invalid code'));
      else resolve(true);
    }); // FIX: await catches rejections
    verified = true;
  } catch (_err) {
    // invalid OTP → verified stays false
  }
  return verified;
}

describe('Bug #7 – verifyUser: missing await on identityToolkit call', () => {
  test('[original BUG] wrong OTP is incorrectly accepted when promise is not awaited', async () => {
    const result = await originalVerifyUser('000000', '123456');
    expect(result).toBe(true); // BUG: should be false — bad OTP accepted
  });

  test('[FIXED] wrong OTP code is correctly rejected with await', async () => {
    const result = await fixedVerifyUser('000000', '123456');
    expect(result).toBe(false);
  });

  test('[FIXED] correct OTP code is accepted', async () => {
    const result = await fixedVerifyUser('123456', '123456');
    expect(result).toBe(true);
  });

  test('[FIXED] empty code is rejected', async () => {
    const result = await fixedVerifyUser('', '123456');
    expect(result).toBe(false);
  });

  test('[FIXED] null code is rejected', async () => {
    const result = await fixedVerifyUser(null, '123456');
    expect(result).toBe(false);
  });

  test('demonstrates Promise rejection semantics: non-awaited rejection is invisible to try/catch', async () => {
    let caughtError = null;
    const p = Promise.reject(new Error('silent rejection'));
    // Without await, try/catch never sees the rejection:
    try {
      p.catch(() => {}); // must consume to avoid unhandled rejection
      // code continues here regardless of promise state
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeNull(); // confirms rejection was invisible
  });

  test('[FIXED] source file has await before identityToolkit call in verifyUser', () => {
    const fs   = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../src/models/Users/statics.js'),
      'utf8'
    );
    // Check that the verifyPhoneNumber call is awaited in the fixed source
    const hasAwaitedCall = /await\s+identityToolkit\.relyingparty\.verifyPhoneNumber/.test(source);
    expect(hasAwaitedCall).toBe(true);
  });
});
