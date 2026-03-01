const { EventEmitter } = require("events");

/**
 * @class CacheManager
 * @description LRU cache with TTL support, events, and category-based statistics
 * @extends EventEmitter
 * @example
 * const cache = new CacheManager({ maxSize: 1000, defaultTTL: 3600 });
 * cache.set('key1', { data: 'value' });
 * const value = cache.get('key1');
 */
class CacheManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || null;
    this.entries = new Map();
    this.accessOrder = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0,
      categories: {},
    };

    this.cleanupInterval = options.cleanupInterval || 60000;
    this.startCleanupTimer();
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this.entries.get(key);

    if (!entry) {
      this.stats.misses++;
      this.emit("miss", { key, timestamp: Date.now() });
      return undefined;
    }

    if (entry.ttl && Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      this.stats.expirations++;
      this.stats.categories[entry.category] =
        (this.stats.categories[entry.category] || 0) - 1;
      this.emit("expiration", {
        key,
        category: entry.category,
        timestamp: Date.now(),
      });
      return undefined;
    }

    this.accessOrder.set(key, Date.now());
    this.stats.hits++;
    this.emit("hit", { key, category: entry.category, timestamp: Date.now() });

    return entry.value;
  }

  /**
   * Set value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {Object} options - Set options
   */
  set(key, value, options = {}) {
    const { ttl = this.defaultTTL, category = "default" } = options;

    const now = Date.now();
    const expiresAt = ttl ? now + ttl : null;

    if (this.entries.has(key)) {
      const oldEntry = this.entries.get(key);
      this.stats.categories[oldEntry.category] =
        (this.stats.categories[oldEntry.category] || 0) - 1;
    }

    this.entries.set(key, {
      value,
      ttl,
      expiresAt,
      category,
      createdAt: now,
      lastAccessed: now,
    });

    this.accessOrder.set(key, now);
    this.stats.sets++;
    this.stats.categories[category] =
      (this.stats.categories[category] || 0) + 1;

    this.emit("set", { key, category, size: this.entries.size });

    if (this.entries.size > this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Delete specific cache entry
   * @param {string} key - Cache key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    if (this.entries.has(key)) {
      const entry = this.entries.get(key);
      this.stats.categories[entry.category] =
        (this.stats.categories[entry.category] || 0) - 1;
      this.entries.delete(key);
      this.accessOrder.delete(key);
      this.stats.deletes++;
      this.emit("delete", {
        key,
        category: entry.category,
        timestamp: Date.now(),
      });
      return true;
    }
    return false;
  }

  /**
   * Clear entire cache
   */
  clear() {
    const size = this.entries.size;
    this.entries.clear();
    this.accessOrder.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0,
      categories: {},
    };
    this.emit("clear", { size, timestamp: Date.now() });
  }

  /**
   * Evict least recently used entry
   * @private
   */
  evictLRU() {
    let lruKey = null;
    let lruTime = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < lruTime) {
        lruTime = accessTime;
        lruKey = key;
      }
    }

    if (lruKey) {
      const entry = this.entries.get(lruKey);
      this.entries.delete(lruKey);
      this.accessOrder.delete(lruKey);
      this.stats.evictions++;
      this.stats.categories[entry.category] =
        (this.stats.categories[entry.category] || 0) - 1;
      this.emit("evict", {
        key: lruKey,
        category: entry.category,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Start periodic cleanup of expired entries
   * @private
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.entries.entries()) {
        if (entry.ttl && now > entry.expiresAt) {
          this.entries.delete(key);
          this.accessOrder.delete(key);
          this.stats.expirations++;
          this.stats.categories[entry.category] =
            (this.stats.categories[entry.category] || 0) - 1;
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.emit("cleanup", { cleaned, remaining: this.entries.size });
      }
    }, this.cleanupInterval);

    this.cleanupTimer.unref();
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const hitRate =
      this.stats.hits + this.stats.misses > 0
        ? (
            (this.stats.hits / (this.stats.hits + this.stats.misses)) *
            100
          ).toFixed(2)
        : 0;

    return {
      ...this.stats,
      hitRate: parseFloat(hitRate),
      totalRequests: this.stats.hits + this.stats.misses,
      size: this.entries.size,
      maxSize: this.maxSize,
      utilization: ((this.entries.size / this.maxSize) * 100).toFixed(2) + "%",
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0,
      categories: {},
    };
    this.emit("stats-reset", { timestamp: Date.now() });
  }

  /**
   * Get entries for specific category
   * @param {string} category - Category name
   * @returns {Object[]} Array of entries
   */
  getByCategory(category) {
    const entries = [];
    for (const [key, entry] of this.entries.entries()) {
      if (entry.category === category) {
        entries.push({ key, ...entry });
      }
    }
    return entries;
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if valid entry exists
   */
  has(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;

    if (entry.ttl && Date.now() > entry.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Get cache size
   * @returns {number} Number of entries
   */
  size() {
    return this.entries.size;
  }

  /**
   * Stop cleanup timer
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

module.exports = { CacheManager };
