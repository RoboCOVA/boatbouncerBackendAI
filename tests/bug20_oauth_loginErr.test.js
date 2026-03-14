/**
 * BUG #20 – controller/user.js  (googleLoginCallbackController, facebookLoginCallbackController)
 * ORIGINAL:  req.logIn(user, (err) => { if (err) { ... } })
 *            but the callback param was named differently and the wrong variable was
 *            checked — in some code-paths `err` was checked as the outer `loginErr`
 *            while `loginErr` (the inner callback param) was ignored.
 *
 * FIX:       Always use the callback parameter `loginErr` consistently:
 *              return req.logIn(user, (loginErr) => {
 *                if (loginErr) { return next(...) }
 *                ...
 *              });
 */

// ─── Simulate passport req.logIn ─────────────────────────────────────────────
function makeReqLogIn(shouldFail) {
  return {
    logIn(user, callback) {
      if (shouldFail) {
        callback(new Error('Session serialisation failed'));
      } else {
        callback(null);
      }
    },
  };
}

// ─── Original (buggy): checks an outer `err` instead of the callback param ──
function originalLoginCallback(req, user, next, redirect) {
  let outerErr = null; // outer variable, NOT the logIn callback error
  return req.logIn(user, (err) => {
    if (outerErr) { // BUG: checks outer variable instead of callback `err`
      return next(new Error('Login failed: ' + outerErr.message));
    }
    redirect(); // always runs, even on logIn error
  });
}

// ─── Fixed: checks the callback param `loginErr` ─────────────────────────────
function fixedLoginCallback(req, user, next, redirect) {
  return req.logIn(user, (loginErr) => {
    if (loginErr) { // FIX: checks the actual callback error
      return next(new Error('Login failed: ' + loginErr.message));
    }
    redirect();
  });
}

describe('Bug #20 – OAuth loginCallback: loginErr check in req.logIn callback', () => {
  test('[original BUG] logIn error is silently swallowed and redirect is called', (done) => {
    const req = makeReqLogIn(true); // logIn will fail
    let redirectCalled = false;
    let nextCalled = false;

    originalLoginCallback(
      req,
      { _id: 'u1' },
      () => { nextCalled = true; done(); },
      () => { redirectCalled = true; done(); }
    );

    // We have to wait for done() — whichever fires first
    setTimeout(() => {
      // BUG: redirect is called even though logIn failed
      expect(redirectCalled).toBe(true);
      expect(nextCalled).toBe(false);
      done();
    }, 50);
  });

  test('[FIXED] logIn error is forwarded to next(), redirect is NOT called', (done) => {
    const req = makeReqLogIn(true);
    let redirectCalled = false;
    let nextCalled = false;
    let nextError = null;

    fixedLoginCallback(
      req,
      { _id: 'u1' },
      (err) => { nextCalled = true; nextError = err; },
      () => { redirectCalled = true; }
    );

    setTimeout(() => {
      expect(nextCalled).toBe(true);
      expect(nextError).toBeInstanceOf(Error);
      expect(nextError.message).toContain('Session serialisation failed');
      expect(redirectCalled).toBe(false);
      done();
    }, 50);
  });

  test('[FIXED] successful logIn calls redirect and does NOT call next()', (done) => {
    const req = makeReqLogIn(false);
    let redirectCalled = false;
    let nextCalled = false;

    fixedLoginCallback(
      req,
      { _id: 'u1' },
      () => { nextCalled = true; },
      () => { redirectCalled = true; }
    );

    setTimeout(() => {
      expect(redirectCalled).toBe(true);
      expect(nextCalled).toBe(false);
      done();
    }, 50);
  });
});
