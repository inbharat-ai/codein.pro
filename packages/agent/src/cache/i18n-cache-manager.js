/**
 * Multilingual i18n Cache Manager
 *
 * Caches translation results with TTL, LRU eviction, and warmup capabilities.
 * Step 5 of production hardening.
 */

export class I18nCacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 5000;
    this.ttlMs = options.ttlMs || 3600000; // 1 hour default
    this.cache = new Map();
    this.accessTimes = new Map();
    this.creationTimes = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      warmupEntries: 0,
      totalQueries: 0,
    };
  }

  /**
   * Generate cache key
   */
  generateCacheKey(srcLang, targetLang, textHash) {
    return `i18n:${srcLang}:${targetLang}:${textHash}`;
  }

  /**
   * Generate text hash (simple implementation)
   */
  generateTextHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return "h_" + Math.abs(hash).toString(36);
  }

  /**
   * Get from cache
   */
  get(srcLang, targetLang, textHash) {
    this.stats.totalQueries++;
    const key = this.generateCacheKey(srcLang, targetLang, textHash);

    // Check if exists and not expired
    if (!this.cache.has(key)) {
      this.stats.misses++;
      return null;
    }

    const createdAt = this.creationTimes.get(key);
    const now = Date.now();

    if (now - createdAt > this.ttlMs) {
      // Expired, remove and return null
      this.cache.delete(key);
      this.creationTimes.delete(key);
      this.accessTimes.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access time for LRU
    this.accessTimes.set(key, now);
    this.stats.hits++;

    return {
      srcLang,
      targetLang,
      text: this.cache.get(key),
      hitAt: new Date().toISOString(),
    };
  }

  /**
   * Set in cache
   */
  set(srcLang, targetLang, textHash, translatedText) {
    const key = this.generateCacheKey(srcLang, targetLang, textHash);
    const now = Date.now();

    // If cache is full, evict LRU entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, translatedText);
    this.creationTimes.set(key, now);
    this.accessTimes.set(key, now);

    return { success: true, key };
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let lruKey = null;
    let oldestAccessTime = Infinity;

    // Find LRU entry
    for (const [key, accessTime] of this.accessTimes) {
      if (accessTime < oldestAccessTime) {
        oldestAccessTime = accessTime;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.creationTimes.delete(lruKey);
      this.accessTimes.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * Warmup cache with common translations
   */
  warmupCache(languagePairs, commonTerms = []) {
    let warmupCount = 0;

    // Default common terms if not provided
    const terms =
      commonTerms.length > 0
        ? commonTerms
        : [
            "hello",
            "goodbye",
            "thank you",
            "please",
            "yes",
            "no",
            "error",
            "success",
            "warning",
            "info",
            "debug",
          ];

    for (const { src, target } of languagePairs) {
      for (const term of terms) {
        // Pre-populate cache with dummy translations
        const hash = this.generateTextHash(term);
        const translatedTerm = `translated-${term}-to-${target}`;

        this.set(src, target, hash, translatedTerm);
        warmupCount++;
      }
    }

    this.stats.warmupEntries += warmupCount;

    return {
      success: true,
      warmupCount,
      languagePairs: languagePairs.length,
      termsPerPair: terms.length,
    };
  }

  /**
   * Invalidate entry
   */
  invalidate(srcLang, targetLang, textHash) {
    const key = this.generateCacheKey(srcLang, targetLang, textHash);

    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.creationTimes.delete(key);
      this.accessTimes.delete(key);
      return { success: true };
    }

    return { success: false, error: "Cache entry not found" };
  }

  /**
   * Invalidate all entries for a language pair
   */
  invalidateLanguagePair(srcLang, targetLang) {
    const prefix = `i18n:${srcLang}:${targetLang}:`;
    let count = 0;

    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.creationTimes.delete(key);
      this.accessTimes.delete(key);
      count++;
    }

    return { success: true, invalidated: count };
  }

  /**
   * Flush entire cache
   */
  flushCache() {
    const size = this.cache.size;
    this.cache.clear();
    this.creationTimes.clear();
    this.accessTimes.clear();

    return { success: true, flushed: size };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate =
      this.stats.totalQueries > 0
        ? ((this.stats.hits / this.stats.totalQueries) * 100).toFixed(2)
        : "0.00";

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: parseFloat(hitRate) + "%",
      totalQueries: this.stats.totalQueries,
      evictions: this.stats.evictions,
      warmupEntries: this.stats.warmupEntries,
      currentSize: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Get detailed cache info
   */
  getCacheInfo() {
    const entries = [];

    for (const [key, value] of this.cache) {
      const createdAt = this.creationTimes.get(key);
      const accessedAt = this.accessTimes.get(key);
      const now = Date.now();

      entries.push({
        key,
        size: JSON.stringify(value).length,
        age: now - createdAt,
        lastAccess: now - accessedAt,
        expired: now - createdAt > this.ttlMs,
      });
    }

    return {
      totalEntries: entries.length,
      entries: entries.slice(0, 20), // Limit to first 20 for display
    };
  }

  /**
   * Get entries by language pair
   */
  getEntriesByLanguagePair(srcLang, targetLang) {
    const prefix = `i18n:${srcLang}:${targetLang}:`;
    const entries = [];

    for (const [key, value] of this.cache) {
      if (key.startsWith(prefix)) {
        entries.push({
          key,
          value,
          createdAt: this.creationTimes.get(key),
          accessedAt: this.accessTimes.get(key),
        });
      }
    }

    return {
      languagePair: `${srcLang} -> ${targetLang}`,
      count: entries.length,
      entries,
    };
  }

  /**
   * Get hot entries (most accessed)
   */
  getHotEntries(limit = 10) {
    const entries = [];

    for (const [key, accessTime] of this.accessTimes) {
      entries.push({ key, accessTime });
    }

    // Sort by access time (most recent first)
    entries.sort((a, b) => b.accessTime - a.accessTime);

    return {
      count: Math.min(limit, entries.length),
      entries: entries.slice(0, limit),
    };
  }

  /**
   * Validate cache integrity
   */
  validateCacheIntegrity() {
    const issues = [];

    // Check for orphaned entries
    for (const key of this.cache.keys()) {
      if (!this.creationTimes.has(key) || !this.accessTimes.has(key)) {
        issues.push(`Orphaned entry: ${key}`);
      }
    }

    // Check for expired entries
    const now = Date.now();
    let expiredCount = 0;
    for (const [key, createdAt] of this.creationTimes) {
      if (now - createdAt > this.ttlMs) {
        expiredCount++;
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      expiredEntries: expiredCount,
      totalEntries: this.cache.size,
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanupExpired() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, createdAt] of this.creationTimes) {
      if (now - createdAt > this.ttlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.creationTimes.delete(key);
      this.accessTimes.delete(key);
    }

    return {
      success: true,
      cleanedUp: keysToDelete.length,
    };
  }
}

export const i18nCacheManager = new I18nCacheManager();

export default { I18nCacheManager, i18nCacheManager };
