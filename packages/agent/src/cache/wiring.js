/**
 * Cache Wiring to Hotspots
 *
 * Integrates caching layers with high-traffic endpoints:
 * Translation endpoints, router decision endpoints, MCP tool calls.
 * Step 7 of production hardening.
 */

class CacheWirings {
  constructor(i18nCache, resultCache = null) {
    this.i18nCache = i18nCache;
    this.resultCache = resultCache || new Map();
    this.wirings = [];
    this.stats = {
      totalRequests: 0,
      cachedResponses: 0,
      cacheInvalidations: 0,
      wiringsApplied: 0,
    };
  }

  /**
   * Wire cache to translation endpoints
   */
  registerTranslationWiring(sourceLanguage, targetLanguage) {
    const wiring = {
      type: "translation",
      source: sourceLanguage,
      target: targetLanguage,
      pattern: `/translate/${sourceLanguage}/${targetLanguage}`,
      enabled: true,
      stats: {
        hits: 0,
        misses: 0,
      },
    };

    this.wirings.push(wiring);
    return { success: true, wiring };
  }

  /**
   * Wire cache to router decision endpoints
   */
  registerRouterWiring(routerId) {
    const wiring = {
      type: "router",
      routerId,
      pattern: `/router/${routerId}/decide`,
      enabled: true,
      stats: {
        hits: 0,
        misses: 0,
      },
    };

    this.wirings.push(wiring);
    return { success: true, wiring };
  }

  /**
   * Wire cache to MCP tool call results
   */
  registerMCPToolWiring(toolName) {
    const wiring = {
      type: "mcp-tool",
      toolName,
      pattern: `/mcp/tools/${toolName}`,
      enabled: true,
      stats: {
        hits: 0,
        misses: 0,
      },
    };

    this.wirings.push(wiring);
    return { success: true, wiring };
  }

  /**
   * Middleware for translation endpoint caching
   */
  translationCacheMiddleware() {
    return async (req, res, next) => {
      this.stats.totalRequests++;

      const { text, srcLang, targetLang } = req.body || {};

      if (!text || !srcLang || !targetLang) {
        return next();
      }

      // Generate cache key
      const textHash = this.i18nCache.generateTextHash(text);

      // Check cache
      const cached = this.i18nCache.get(srcLang, targetLang, textHash);
      if (cached) {
        this.stats.cachedResponses++;
        const wiring = this.wirings.find(
          (w) =>
            w.type === "translation" &&
            w.source === srcLang &&
            w.target === targetLang,
        );
        if (wiring) wiring.stats.hits++;

        return res.json({
          success: true,
          text: cached.text,
          srcLang,
          targetLang,
          source: "cache",
          timestamp: new Date().toISOString(),
        });
      }

      // Cache miss - proceed to handler
      const wiring = this.wirings.find(
        (w) =>
          w.type === "translation" &&
          w.source === srcLang &&
          w.target === targetLang,
      );
      if (wiring) wiring.stats.misses++;

      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to cache result
      res.json = (data) => {
        if (data.success && data.translated) {
          this.i18nCache.set(srcLang, targetLang, textHash, data.translated);
        }
        return originalJson(data);
      };

      next();
    };
  }

  /**
   * Middleware for router decision caching
   */
  routerCacheMiddleware() {
    return async (req, res, next) => {
      this.stats.totalRequests++;

      const { input, routerId } = req.body || {};

      if (!input || !routerId) {
        return next();
      }

      // Generate cache key
      const cacheKey = `router:${routerId}:${JSON.stringify(input)}`;

      // Check cache
      if (this.resultCache.has(cacheKey)) {
        this.stats.cachedResponses++;
        const wiring = this.wirings.find(
          (w) => w.type === "router" && w.routerId === routerId,
        );
        if (wiring) wiring.stats.hits++;

        return res.json({
          success: true,
          decision: this.resultCache.get(cacheKey),
          source: "cache",
          timestamp: new Date().toISOString(),
        });
      }

      const wiring = this.wirings.find(
        (w) => w.type === "router" && w.routerId === routerId,
      );
      if (wiring) wiring.stats.misses++;

      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to cache result
      res.json = (data) => {
        if (data.success && data.decision) {
          this.resultCache.set(cacheKey, data.decision);

          // Limit cache size
          if (this.resultCache.size > 5000) {
            const firstKey = this.resultCache.keys().next().value;
            this.resultCache.delete(firstKey);
          }
        }
        return originalJson(data);
      };

      next();
    };
  }

  /**
   * Middleware for MCP tool call caching
   */
  mcpToolCacheMiddleware() {
    return async (req, res, next) => {
      this.stats.totalRequests++;

      const { params, toolName } = req.body || {};

      if (!params || !toolName) {
        return next();
      }

      // Generate cache key
      const cacheKey = `mcp-tool:${toolName}:${JSON.stringify(params)}`;

      // Check cache
      if (this.resultCache.has(cacheKey)) {
        this.stats.cachedResponses++;
        const wiring = this.wirings.find(
          (w) => w.type === "mcp-tool" && w.toolName === toolName,
        );
        if (wiring) wiring.stats.hits++;

        return res.json({
          success: true,
          result: this.resultCache.get(cacheKey),
          source: "cache",
          timestamp: new Date().toISOString(),
        });
      }

      const wiring = this.wirings.find(
        (w) => w.type === "mcp-tool" && w.toolName === toolName,
      );
      if (wiring) wiring.stats.misses++;

      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to cache result
      res.json = (data) => {
        if (data.success && data.result) {
          this.resultCache.set(cacheKey, data.result);

          // Limit cache size
          if (this.resultCache.size > 5000) {
            const firstKey = this.resultCache.keys().next().value;
            this.resultCache.delete(firstKey);
          }
        }
        return originalJson(data);
      };

      next();
    };
  }

  /**
   * Invalidate cache on model changes
   */
  invalidateOnModelChange(modelId) {
    // Invalidate all translation caches when model changes
    this.i18nCache.flushCache();

    // Invalidate result caches
    this.resultCache.clear();

    this.stats.cacheInvalidations++;

    return {
      success: true,
      invalidated: "all",
      reason: `Model ${modelId} changed`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Invalidate specific language pair
   */
  invalidateLanguagePair(srcLang, targetLang) {
    const result = this.i18nCache.invalidateLanguagePair(srcLang, targetLang);

    this.stats.cacheInvalidations++;

    return {
      success: true,
      language_pair: `${srcLang} -> ${targetLang}`,
      ...result,
    };
  }

  /**
   * Get all wirings
   */
  getWirings() {
    return this.wirings.map((w) => ({
      type: w.type,
      pattern: w.pattern,
      enabled: w.enabled,
      hitRate:
        w.stats.hits + w.stats.misses > 0
          ? ((w.stats.hits / (w.stats.hits + w.stats.misses)) * 100).toFixed(
              2,
            ) + "%"
          : "N/A",
      stats: w.stats,
    }));
  }

  /**
   * Get wiring stats
   */
  getWiringStats(wiringType = null) {
    const wirings = wiringType
      ? this.wirings.filter((w) => w.type === wiringType)
      : this.wirings;

    const totalHits = wirings.reduce((sum, w) => sum + w.stats.hits, 0);
    const totalMisses = wirings.reduce((sum, w) => sum + w.stats.misses, 0);
    const hitRate =
      totalHits + totalMisses > 0
        ? ((totalHits / (totalHits + totalMisses)) * 100).toFixed(2)
        : 0;

    return {
      wiringCount: wirings.length,
      totalHits,
      totalMisses,
      hitRate: parseFloat(hitRate) + "%",
      averageHitRatePerWiring:
        wirings.length > 0
          ? (
              wirings.reduce((sum, w) => {
                const rate =
                  w.stats.hits + w.stats.misses > 0
                    ? (w.stats.hits / (w.stats.hits + w.stats.misses)) * 100
                    : 0;
                return sum + rate;
              }, 0) / wirings.length
            ).toFixed(2) + "%"
          : "N/A",
    };
  }

  /**
   * Get global stats
   */
  getStats() {
    const cacheHitRate =
      this.stats.totalRequests > 0
        ? (
            (this.stats.cachedResponses / this.stats.totalRequests) *
            100
          ).toFixed(2)
        : 0;

    return {
      totalRequests: this.stats.totalRequests,
      cachedResponses: this.stats.cachedResponses,
      hitRate: parseFloat(cacheHitRate) + "%",
      cacheInvalidations: this.stats.cacheInvalidations,
      wiringsApplied: this.wirings.length,
      detailedByType: {
        translation: this.getWiringStats("translation"),
        router: this.getWiringStats("router"),
        mcpTool: this.getWiringStats("mcp-tool"),
      },
    };
  }

  /**
   * Enable/disable specific wiring
   */
  setWiringEnabled(pattern, enabled) {
    const wiring = this.wirings.find((w) => w.pattern === pattern);

    if (!wiring) {
      return { success: false, error: "Wiring not found" };
    }

    wiring.enabled = enabled;

    return {
      success: true,
      pattern,
      enabled,
    };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      cachedResponses: 0,
      cacheInvalidations: 0,
      wiringsApplied: this.wirings.length,
    };

    for (const wiring of this.wirings) {
      wiring.stats = { hits: 0, misses: 0 };
    }

    return { success: true, message: "Stats reset" };
  }
}

module.exports = { CacheWirings };
