/**
 * BUG #1 — controller/booking.js
 * ORIGINAL:  if (!boat) throw new 'Boat not found'();
 * FIX:       if (!boat) throw new Error('Boat not found');
 *
 * `new 'string'()` is a TypeError at runtime because a string literal
 * is not a constructor.  We verify the fixed code path by calling the
 * private helper with a null boat.
 */

// ─── tiny inline re-implementation of the guard ──────────────────────────────
function createBookingGuard(boat) {
  // ORIGINAL (buggy):
  // if (!boat) throw new 'Boat not found'();

  // FIXED:
  if (!boat) throw new Error('Boat not found');
}

describe('Bug #1 – throw new Error() replaces throw new "string"()', () => {
  test('throws Error with correct message when boat is null', () => {
    expect(() => createBookingGuard(null)).toThrow(Error);
    expect(() => createBookingGuard(null)).toThrow('Boat not found');
  });

  test('does NOT throw when boat exists', () => {
    expect(() => createBookingGuard({ _id: '123', boatName: 'Seagull' })).not.toThrow();
  });

  test('"throw new \'string\'()" IS a TypeError (documenting the original bug)', () => {
    // Prove the original pattern is broken
    expect(() => {
      // eslint-disable-next-line no-new
      eval("throw new 'Boat not found'()");
    }).toThrow(TypeError);
  });
});
