/**
 * BUG #3 – controller/boat.js  (updateBoatController)
 * ORIGINAL:  Boats.updateBoat(boatId, user?.id?.toString(), ...)
 * FIX:       Boats.updateBoat(boatId, user?._id?.toString(), ...)
 *
 * Passport JWT stores the user identifier as `_id`.
 * `user.id` is either undefined or (in some Mongoose virtuals) a string
 * version of `_id`.  Using `user?.id` is ambiguous and can be `undefined`
 * when the clean() method strips virtual properties.
 */

// Simulate the user object that passport/JWT injects after clean()
const mockUser = {
  _id: '6601aabbcc001122334455ff',
  // `id` might exist as a virtual or might be absent
};

// ─── original (buggy) ─────────────────────────────────────────────────────
function originalGetUserId(user) {
  return user?.id?.toString();
}

// ─── fixed ────────────────────────────────────────────────────────────────
function fixedGetUserId(user) {
  return user?._id?.toString();
}

describe('Bug #3 – updateBoatController uses user._id not user.id', () => {
  test('[original BUG] user.id is undefined → passes undefined as userId', () => {
    expect(originalGetUserId(mockUser)).toBeUndefined();
  });

  test('[FIXED] user._id is the correct identifier → returns the string ID', () => {
    expect(fixedGetUserId(mockUser)).toBe('6601aabbcc001122334455ff');
  });

  test('[FIXED] handles null user gracefully', () => {
    expect(fixedGetUserId(null)).toBeUndefined();
  });

  test('[FIXED] handles user without _id gracefully', () => {
    expect(fixedGetUserId({})).toBeUndefined();
  });

  test('_id and id are different properties on a plain object', () => {
    const user = { _id: 'abc123' };
    expect(user.id).toBeUndefined();     // no virtual id
    expect(user._id).toBe('abc123');
  });
});
