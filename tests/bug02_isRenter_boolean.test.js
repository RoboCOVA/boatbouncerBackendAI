/**
 * BUG #2 – controller/booking.js  (cancelBookingController, getBookingsController,
 *                                   getBookingController)
 * ORIGINAL:  const { isRenter } = req.query;   // always a string
 *            if (isRenter) { ... }              // string "false" is TRUTHY → wrong branch
 *
 * FIX:       const isRenter = req.query.isRenter === 'true';
 *
 * Express query params are always strings.  "false" is a truthy string, so
 * the original code treated isRenter=false as renter queries.
 */

// ─── reproduce the original bug ──────────────────────────────────────────────
function originalIsRenterLogic(queryParam) {
  const isRenter = queryParam;       // raw string from req.query
  return isRenter ? 'renter' : 'owner';
}

// ─── fixed logic ─────────────────────────────────────────────────────────────
function fixedIsRenterLogic(queryParam) {
  const isRenter = queryParam === 'true';
  return isRenter ? 'renter' : 'owner';
}

describe('Bug #2 – isRenter query-string boolean coercion', () => {
  // ── original behaviour (buggy) ──────────────────────────────────────────
  test('[original BUG] isRenter="false" was treated as truthy → returned "renter"', () => {
    expect(originalIsRenterLogic('false')).toBe('renter'); // BUG: should be 'owner'
  });

  test('[original BUG] isRenter=undefined correctly returned "owner"', () => {
    expect(originalIsRenterLogic(undefined)).toBe('owner');
  });

  // ── fixed behaviour ────────────────────────────────────────────────────
  test('[FIXED] isRenter="true"  → "renter"', () => {
    expect(fixedIsRenterLogic('true')).toBe('renter');
  });

  test('[FIXED] isRenter="false" → "owner"', () => {
    expect(fixedIsRenterLogic('false')).toBe('owner');
  });

  test('[FIXED] isRenter=undefined → "owner"', () => {
    expect(fixedIsRenterLogic(undefined)).toBe('owner');
  });

  test('[FIXED] isRenter="TRUE"  → "owner" (case-sensitive, correct strictness)', () => {
    expect(fixedIsRenterLogic('TRUE')).toBe('owner');
  });
});
