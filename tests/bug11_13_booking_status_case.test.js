/**
 * BUG #11 – models/Bookings/statics.js  (getBookings, cancelBooking, getBooking)
 * BUG #13 – same file
 *
 * ORIGINAL:  queries used lowercase 'cancelled' / 'completed' strings directly
 *            while the Mongoose schema enum uses capitalized: 'Cancelled', 'Completed'
 *            → documents are never matched → wrong results silently returned
 *
 * FIX:       use bookingStatus.CANCELLED / bookingStatus.COMPLETED constants
 *            (values are 'Cancelled' and 'Completed' respectively)
 */

const bookingStatus = {
  PENDING:   'Pending',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// ─── Simulate a bookings collection ──────────────────────────────────────────
const bookings = [
  { _id: '1', status: 'Pending',   renter: 'u1' },
  { _id: '2', status: 'Completed', renter: 'u1' },
  { _id: '3', status: 'Cancelled', renter: 'u1' },
  { _id: '4', status: 'Pending',   renter: 'u2' },
];

// ─── Original: hard-coded lowercase strings ───────────────────────────────────
function originalGetActiveBookings(userId) {
  return bookings.filter(
    (b) => b.renter === userId &&
           b.status !== 'cancelled' && // BUG: wrong case
           b.status !== 'completed'    // BUG: wrong case
  );
}

function originalGetCancelledBookings(userId) {
  return bookings.filter(
    (b) => b.renter === userId && b.status === 'cancelled' // BUG: wrong case
  );
}

// ─── Fixed: use constants with correct capitalization ────────────────────────
function fixedGetActiveBookings(userId) {
  return bookings.filter(
    (b) => b.renter === userId &&
           b.status !== bookingStatus.CANCELLED &&
           b.status !== bookingStatus.COMPLETED
  );
}

function fixedGetCancelledBookings(userId) {
  return bookings.filter(
    (b) => b.renter === userId && b.status === bookingStatus.CANCELLED
  );
}

describe('Bug #11/#13 – booking status case mismatch ("cancelled" vs "Cancelled")', () => {
  // ── original bugs ─────────────────────────────────────────────────────
  test('[original BUG] getActiveBookings includes Completed/Cancelled because case mismatch', () => {
    const result = originalGetActiveBookings('u1');
    // BUG: Completed and Cancelled are not filtered out
    expect(result.map((b) => b._id)).toEqual(['1', '2', '3']); // should only be ['1']
  });

  test('[original BUG] getCancelledBookings returns empty array because case mismatch', () => {
    const result = originalGetCancelledBookings('u1');
    expect(result).toHaveLength(0); // BUG: should be 1
  });

  // ── fixed behaviour ────────────────────────────────────────────────────
  test('[FIXED] getActiveBookings excludes Cancelled and Completed bookings', () => {
    const result = fixedGetActiveBookings('u1');
    expect(result.map((b) => b._id)).toEqual(['1']);
  });

  test('[FIXED] getCancelledBookings returns only Cancelled bookings', () => {
    const result = fixedGetCancelledBookings('u1');
    expect(result.map((b) => b._id)).toEqual(['3']);
  });

  test('[FIXED] bookingStatus constants have correct capitalised values', () => {
    expect(bookingStatus.CANCELLED).toBe('Cancelled');
    expect(bookingStatus.COMPLETED).toBe('Completed');
    expect(bookingStatus.PENDING).toBe('Pending');
  });

  test('[FIXED] no cross-user leakage', () => {
    expect(fixedGetActiveBookings('u2').map((b) => b._id)).toEqual(['4']);
    expect(fixedGetCancelledBookings('u2')).toHaveLength(0);
  });
});
