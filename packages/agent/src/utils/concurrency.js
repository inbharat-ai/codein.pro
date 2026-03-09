/**
 * Idempotency + Concurrency Guards
 *
 * - IdempotencyCache: deduplicates POST requests using client-supplied Idempotency-Key header
 * - ConcurrencyLimiter: caps in-flight async operations per resource
 */
"use strict";

class IdempotencyCache {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxEntries=5000]
   * @param {number} [opts.ttlMs=300000] — 5 minutes default
   */
  constructor(opts = {}) {
    this._maxEntries = opts.maxEntries || 5000;
    this._ttlMs = opts.ttlMs || 5 * 60 * 1000;
    /** @type {Map<string, { status: number, body: string, expiresAt: number }>} */
    this._cache = new Map();
    this._timer = setInterval(() => this._evict(), 60_000);
    if (typeof this._timer.unref === "function") this._timer.unref();
  }

  /**
   * Check if request with this key has already been processed.
   * @param {string} key
   * @returns {{ hit: boolean, status?: number, body?: string }}
   */
  get(key) {
    const entry = this._cache.get(key);
    if (!entry) return { hit: false };
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return { hit: false };
    }
    return { hit: true, status: entry.status, body: entry.body };
  }

  /**
   * Store a response.
   * @param {string} key
   * @param {number} status
   * @param {string} body
   */
  set(key, status, body) {
    // LRU eviction if at capacity
    if (this._cache.size >= this._maxEntries) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    this._cache.set(key, {
      status,
      body,
      expiresAt: Date.now() + this._ttlMs,
    });
  }

  _evict() {
    const now = Date.now();
    for (const [key, entry] of this._cache) {
      if (now > entry.expiresAt) this._cache.delete(key);
    }
  }

  destroy() {
    clearInterval(this._timer);
    this._cache.clear();
  }
}

class ConcurrencyLimiter {
  /**
   * @param {number} maxConcurrent — maximum simultaneous operations
   * @param {number} [maxQueue] — maximum queued requests (default 2x maxConcurrent)
   */
  constructor(maxConcurrent = 50, maxQueue) {
    this._max = maxConcurrent;
    this._maxQueue = maxQueue ?? maxConcurrent * 2;
    this._active = 0;
    this._queue = [];
  }

  /**
   * Run fn() when a slot is available.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async run(fn) {
    if (this._active >= this._max) {
      if (this._queue.length >= this._maxQueue) {
        throw Object.assign(new Error("Server overloaded"), {
          statusCode: 503,
        });
      }
      await new Promise((resolve) => this._queue.push(resolve));
    }
    this._active++;
    try {
      return await fn();
    } finally {
      this._active--;
      if (this._queue.length > 0) {
        const next = this._queue.shift();
        next();
      }
    }
  }

  get activeCount() {
    return this._active;
  }

  get queueLength() {
    return this._queue.length;
  }
}

module.exports = { IdempotencyCache, ConcurrencyLimiter };
