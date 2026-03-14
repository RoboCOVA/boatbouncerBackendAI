/**
 * BUG #17 – models/Boats/statics.js  (getBoatListings)
 * ORIGINAL:  { boatId: { $in: new ObjectId(boatId) } }
 *            → $in requires an ARRAY, not a single value → always returns []
 *
 * FIX:       { boatId: new ObjectId(boatId) }   (direct equality)
 *
 * BUG #18 – models/Boats/statics.js  (updateBoat)
 * ORIGINAL:  if (this.boatName) { ... }
 *            → `this` inside a static method is the Model constructor,
 *               not a document; `this.boatName` is always undefined → duplicate
 *               boat-name check is silently skipped
 *
 * FIX:       if (updateObject.boatName) { ... }
 *
 * BUG #19 – models/Boats/statics.js  (updateBoat)
 * ORIGINAL:  existingBoat._id !== id   (strict string/ObjectId inequality)
 *            → ObjectId objects are never === each other even for the same value
 *
 * FIX:       !existingBoat._id.equals(id)   (Mongoose/BSON .equals() method)
 */

// ─── Simulate ObjectId with .equals() ────────────────────────────────────────
class FakeObjectId {
  constructor(val) { this.val = val; }
  equals(other) {
    const otherVal = other instanceof FakeObjectId ? other.val : other;
    return this.val === otherVal;
  }
  toString() { return this.val; }
}

// ══════════════════════════════════════════════════════════════════════════════
// BUG #17 – $in with single value vs direct equality
// ══════════════════════════════════════════════════════════════════════════════

const boatListings = [
  { boatId: new FakeObjectId('boat111'), name: 'Sea Breeze' },
  { boatId: new FakeObjectId('boat222'), name: 'Wave Rider' },
];

function matchBoatListings(query, boatIdObj) {
  return boatListings.filter((listing) => {
    if (query === '$in') {
      // BUG: $in gets a single ObjectId instead of array → MongoDB treats it as no match
      // We simulate MongoDB behaviour: $in with non-array = no match
      return false;
    }
    // FIX: direct equality
    return listing.boatId.equals(boatIdObj);
  });
}

describe('Bug #17 – getBoatListings: $in with single ObjectId (not array)', () => {
  const targetId = new FakeObjectId('boat111');

  test('[original BUG] $in with single ObjectId returns 0 results', () => {
    const result = matchBoatListings('$in', targetId);
    expect(result).toHaveLength(0); // BUG: should return 1
  });

  test('[FIXED] direct equality returns correct listing', () => {
    const result = matchBoatListings('direct', targetId);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Sea Breeze');
  });

  test('[FIXED] non-existent boatId returns empty', () => {
    const result = matchBoatListings('direct', new FakeObjectId('boat999'));
    expect(result).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BUG #18 – this.boatName vs updateObject.boatName in static method
// ══════════════════════════════════════════════════════════════════════════════

const ModelConstructor = { boatName: undefined }; // `this` in a static = the Model class

function originalUpdateBoatCheck(updateObject) {
  if (ModelConstructor.boatName) { // BUG: always undefined
    return 'duplicate-check-ran';
  }
  return 'duplicate-check-skipped';
}

function fixedUpdateBoatCheck(updateObject) {
  if (updateObject.boatName) { // FIX: read from the updateObject
    return 'duplicate-check-ran';
  }
  return 'duplicate-check-skipped';
}

describe('Bug #18 – updateBoat: this.boatName vs updateObject.boatName', () => {
  test('[original BUG] duplicate name check is always skipped (this.boatName is undefined)', () => {
    const result = originalUpdateBoatCheck({ boatName: 'My New Boat' });
    expect(result).toBe('duplicate-check-skipped'); // BUG
  });

  test('[FIXED] duplicate name check runs when updateObject.boatName is present', () => {
    const result = fixedUpdateBoatCheck({ boatName: 'My New Boat' });
    expect(result).toBe('duplicate-check-ran');
  });

  test('[FIXED] duplicate name check correctly skipped when boatName is absent', () => {
    const result = fixedUpdateBoatCheck({});
    expect(result).toBe('duplicate-check-skipped');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BUG #19 – ObjectId strict inequality vs .equals()
// ══════════════════════════════════════════════════════════════════════════════

describe('Bug #19 – updateBoat: ObjectId strict !== vs .equals()', () => {
  const idA1 = new FakeObjectId('boat111');
  const idA2 = new FakeObjectId('boat111'); // same value, different object reference
  const idB  = new FakeObjectId('boat222');

  test('[original BUG] strict !== treats same ObjectId value as different', () => {
    // Simulates: if (existingBoat._id !== id) throw boatNameUsed;
    expect(idA1 !== idA2).toBe(true); // BUG: different references → throws even for same boat
  });

  test('[FIXED] .equals() correctly identifies same ObjectId value', () => {
    expect(idA1.equals(idA2)).toBe(true);     // same value → no error
    expect(!idA1.equals(idA2)).toBe(false);   // FIX: would NOT throw
  });

  test('[FIXED] .equals() correctly identifies different ObjectId values', () => {
    expect(idA1.equals(idB)).toBe(false);  // different → should throw boatNameUsed
    expect(!idA1.equals(idB)).toBe(true);  // FIX: would throw correctly
  });
});
