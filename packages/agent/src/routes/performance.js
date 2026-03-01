/**
 * Performance monitoring route handlers.
 * Exposes cache stats, HTTP pool metrics, and overall system health.
 */
const { jsonResponse, handleRoute } = require("../utils/http-helpers");

function registerPerformanceRoutes(router, deps) {
  const { cache, httpPool, logger } = deps;

  // ── Cache statistics ─────────────────────────────────────────────────
  router.get("/perf/cache/stats", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        if (!cache) {
          jsonResponse(res, 200, { available: false });
          return;
        }
        const stats = cache.getStats ? cache.getStats() : cache.stats || {};
        const hitRate =
          stats.hits + stats.misses > 0
            ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
            : "0.0";

        jsonResponse(res, 200, {
          available: true,
          size: cache.entries ? cache.entries.size : 0,
          maxSize: cache.maxSize || 0,
          hitRate: `${hitRate}%`,
          ...stats,
        });
      },
      logger,
    );
  });

  // ── Cache flush ──────────────────────────────────────────────────────
  router.post("/perf/cache/flush", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        if (!cache) {
          jsonResponse(res, 200, { flushed: false });
          return;
        }
        const sizeBefore = cache.entries ? cache.entries.size : 0;
        if (cache.clear) cache.clear();
        jsonResponse(res, 200, { flushed: true, entriesCleared: sizeBefore });
      },
      logger,
    );
  });

  // ── HTTP Pool statistics ─────────────────────────────────────────────
  router.get("/perf/pool/stats", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        if (!httpPool) {
          jsonResponse(res, 200, { available: false });
          return;
        }
        const stats = httpPool.getStats
          ? httpPool.getStats()
          : httpPool.requestStats || {};
        jsonResponse(res, 200, {
          available: true,
          maxSockets: httpPool.maxSockets || 0,
          ...stats,
        });
      },
      logger,
    );
  });

  // ── Combined performance summary ─────────────────────────────────────
  router.get("/perf/summary", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const mem = process.memoryUsage();
        const uptime = process.uptime();

        const cacheStats = cache?.stats || {};
        const poolStats = httpPool?.requestStats || {};
        const cacheHitRate =
          (cacheStats.hits || 0) + (cacheStats.misses || 0) > 0
            ? ((cacheStats.hits || 0) /
                ((cacheStats.hits || 0) + (cacheStats.misses || 0))) *
              100
            : 0;

        jsonResponse(res, 200, {
          uptime: `${Math.floor(uptime)}s`,
          memory: {
            heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
            heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(1),
            rssMB: (mem.rss / 1024 / 1024).toFixed(1),
            externalMB: (mem.external / 1024 / 1024).toFixed(1),
          },
          cache: {
            size: cache?.entries?.size || 0,
            hitRate: `${cacheHitRate.toFixed(1)}%`,
            hits: cacheStats.hits || 0,
            misses: cacheStats.misses || 0,
            evictions: cacheStats.evictions || 0,
          },
          httpPool: {
            active: poolStats.activeRequests || 0,
            completed: poolStats.completed || 0,
            failed: poolStats.failed || 0,
            avgDuration: poolStats.averageDuration
              ? `${Math.round(poolStats.averageDuration)}ms`
              : "N/A",
          },
        });
      },
      logger,
    );
  });
}

module.exports = { registerPerformanceRoutes };
