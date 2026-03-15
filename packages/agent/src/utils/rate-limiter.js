"use strict";

class RateLimiter {
  /**
   * @param {object} opts
   * @param {number} opts.maxRequests — max requests per window
   * @param {number} opts.windowMs — window duration in ms
   */
  constructor({ maxRequests = 60, windowMs = 60000 } = {}) {
    this._max = maxRequests;
    this._window = windowMs;
    this._buckets = new Map(); // key -> [timestamps]
  }

  /**
   * Check if a request is allowed for the given key.
   * @param {string} key — rate limit key (e.g., IP, route, userId)
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  check(key) {
    const now = Date.now();
    const cutoff = now - this._window;

    let timestamps = this._buckets.get(key);
    if (!timestamps) {
      timestamps = [];
      this._buckets.set(key, timestamps);
    }

    // Remove expired entries
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this._max) {
      const retryAfter = timestamps[0] + this._window - now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, retryAfter),
      };
    }

    timestamps.push(now);
    return {
      allowed: true,
      remaining: this._max - timestamps.length,
      retryAfterMs: 0,
    };
  }

  /** Reset limiter for a key */
  reset(key) {
    this._buckets.delete(key);
  }

  /** Clear all state */
  clear() {
    this._buckets.clear();
  }
}

module.exports = { RateLimiter };
