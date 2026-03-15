"use strict";

const assert = require("node:assert/strict");
const { RateLimiter } = require("../src/utils/rate-limiter");

describe("RateLimiter", () => {
  it("allows requests under limit", () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });
    for (let i = 0; i < 5; i++) {
      const result = limiter.check("key1");
      assert.equal(result.allowed, true);
    }
  });

  it("blocks requests over limit", () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60000 });
    limiter.check("key1");
    limiter.check("key1");
    limiter.check("key1");
    const result = limiter.check("key1");
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
    assert.ok(result.retryAfterMs > 0);
  });

  it("returns correct remaining count", () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });
    const r1 = limiter.check("key1");
    assert.equal(r1.remaining, 4);
    const r2 = limiter.check("key1");
    assert.equal(r2.remaining, 3);
    const r3 = limiter.check("key1");
    assert.equal(r3.remaining, 2);
  });

  it("sliding window expires old entries", async () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 50 });
    limiter.check("key1");
    limiter.check("key1");
    // Should be blocked now
    assert.equal(limiter.check("key1").allowed, false);
    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));
    // Should be allowed again
    const result = limiter.check("key1");
    assert.equal(result.allowed, true);
  });

  it("reset clears a specific key", () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });
    limiter.check("key1");
    limiter.check("key1");
    assert.equal(limiter.check("key1").allowed, false);
    limiter.reset("key1");
    assert.equal(limiter.check("key1").allowed, true);
  });

  it("clear removes all state", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
    limiter.check("key1");
    limiter.check("key2");
    assert.equal(limiter.check("key1").allowed, false);
    assert.equal(limiter.check("key2").allowed, false);
    limiter.clear();
    assert.equal(limiter.check("key1").allowed, true);
    assert.equal(limiter.check("key2").allowed, true);
  });

  it("different keys are independent", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
    const r1 = limiter.check("key1");
    assert.equal(r1.allowed, true);
    const r2 = limiter.check("key2");
    assert.equal(r2.allowed, true);
    // key1 should be blocked, key2 should also be blocked (both used their 1 request)
    assert.equal(limiter.check("key1").allowed, false);
    assert.equal(limiter.check("key2").allowed, false);
    // But key3 should still be allowed
    assert.equal(limiter.check("key3").allowed, true);
  });
});
