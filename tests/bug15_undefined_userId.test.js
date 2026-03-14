/**
 * BUG #15 – models/Boats/statics.js  (getBoats)
 * ORIGINAL:  new ObjectId(userId)  called even when userId is undefined
 *            → BSONTypeError / invalid ObjectId crash for unauthenticated (guest) requests
 *
 * FIX:       guard the ObjectId construction → only convert when userId is defined;
 *            for guests use an always-false expression so favorites are not queried.
 */

// ─── Simulate BSON ObjectId construction ─────────────────────────────────────
function ObjectId(val) {
  if (!val || typeof val !== 'string' || val.length !== 24) {
    throw new TypeError(`Invalid ObjectId: ${val}`);
  }
  return { _oid: val };
}
ObjectId.isValid = (val) => typeof val === 'string' && val.length === 24;

// ─── Original (buggy): unconditional ObjectId construction ───────────────────
function originalBuildFavoriteStage(userId) {
  return { $eq: ['$user', new ObjectId(userId)] }; // throws if userId is undefined
}

// ─── Fixed: guard against undefined userId ───────────────────────────────────
function fixedBuildFavoriteStage(userId) {
  return userId
    ? { $eq: ['$user', new ObjectId(userId)] }
    : { $eq: [1, 0] }; // always-false for guests
}

describe('Bug #15 – getBoats crashes with undefined userId (unauthenticated guest)', () => {
  const validId = '6601aabbcc001122334455ff';

  test('[original BUG] throws BSONTypeError/TypeError when userId is undefined', () => {
    expect(() => originalBuildFavoriteStage(undefined)).toThrow(TypeError);
  });

  test('[original BUG] throws for null userId', () => {
    expect(() => originalBuildFavoriteStage(null)).toThrow(TypeError);
  });

  test('[FIXED] returns always-false expression when userId is undefined', () => {
    const stage = fixedBuildFavoriteStage(undefined);
    expect(stage).toEqual({ $eq: [1, 0] });
  });

  test('[FIXED] returns always-false expression when userId is null', () => {
    const stage = fixedBuildFavoriteStage(null);
    expect(stage).toEqual({ $eq: [1, 0] });
  });

  test('[FIXED] returns ObjectId expression when userId is valid', () => {
    const stage = fixedBuildFavoriteStage(validId);
    expect(stage).toEqual({ $eq: ['$user', { _oid: validId }] });
  });

  test('[FIXED] ObjectId.isValid correctly validates IDs', () => {
    expect(ObjectId.isValid(validId)).toBe(true);
    expect(ObjectId.isValid(undefined)).toBe(false);
    expect(ObjectId.isValid('short')).toBe(false);
  });
});
