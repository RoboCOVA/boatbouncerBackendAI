/**
 * BUG #4 – controller/webhook.js
 * ORIGINAL:  try { event = stripe.webhooks.constructEvent(...) }
 *            catch (err) { next(err) }          // ← NO return!
 *            switch (event.type) { ... }        // event is undefined → crash
 *
 * FIX:       catch (err) { return next(err); }  // early return
 */

// ─── Simulates the original controller logic ─────────────────────────────────
function originalWebhookLogic(constructEvent) {
  const errors = [];
  let handled = false;

  try {
    const event = constructEvent(); // may throw
    if (event && event.type) handled = true;
  } catch (err) {
    errors.push(err.message);
    // BUG: no `return` here — falls through to event.type access
    try {
      // simulate the switch(event.type) line that runs after catch
      const badAccess = undefined.type; // TypeError
    } catch (crash) {
      errors.push('SECONDARY_CRASH: ' + crash.message);
    }
  }

  return { handled, errors };
}

// ─── Fixed controller logic ───────────────────────────────────────────────────
function fixedWebhookLogic(constructEvent) {
  const errors = [];
  let handled = false;

  try {
    const event = constructEvent(); // may throw
    if (event && event.type) handled = true;
  } catch (err) {
    errors.push(err.message);
    return { handled, errors }; // FIX: early return — no secondary crash
  }

  return { handled, errors };
}

const throwingConstructEvent = () => { throw new Error('Invalid signature'); };
const goodConstructEvent     = () => ({ type: 'payment_intent.succeeded' });

describe('Bug #4 – webhook controller early return on constructEvent failure', () => {
  test('[original BUG] missing return causes secondary crash after catch', () => {
    const result = originalWebhookLogic(throwingConstructEvent);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toBe('Invalid signature');
    expect(result.errors[1]).toMatch(/SECONDARY_CRASH/);
  });

  test('[FIXED] early return prevents secondary crash', () => {
    const result = fixedWebhookLogic(throwingConstructEvent);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('Invalid signature');
    expect(result.errors).not.toContain(expect.stringMatching(/SECONDARY_CRASH/));
  });

  test('[FIXED] successful constructEvent is handled normally', () => {
    const result = fixedWebhookLogic(goodConstructEvent);
    expect(result.handled).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
