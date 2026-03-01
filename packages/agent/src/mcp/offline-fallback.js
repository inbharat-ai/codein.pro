/**
 * MCP Connector Offline Fallback Module
 *
 * Handles MCP connection failures and fallback cascades.
 * Implements primary → secondary → offline mode fallback chain.
 * Step 4 of production hardening.
 */

export class MCPOfflineFallback {
  constructor(options = {}) {
    this.fallbackChain = options.fallbackChain || []; // Array of server configs
    this.cacheResults = options.cacheResults !== false;
    this.offlineCache = new Map();
    this.currentPrimaryIndex = 0;
    this.lastConnectionError = null;
    this.offlineMode = false;
    this.failoverThreshold = options.failoverThreshold || 3;
    this.consecutiveErrors = 0;
    this.fallbackStats = {
      totalAttempts: 0,
      successfulCalls: 0,
      cachedResults: 0,
      offlineModeSwitches: 0,
    };
  }

  /**
   * Add server to fallback chain
   */
  addFallbackServer(serverConfig) {
    this.fallbackChain.push({
      ...serverConfig,
      priority: this.fallbackChain.length,
      available: true,
    });

    return { success: true, chainLength: this.fallbackChain.length };
  }

  /**
   * Execute call with fallback handling
   */
  async executeWithFallback(callParams, timeout = 10000) {
    this.fallbackStats.totalAttempts++;

    // Check offline cache first
    const cacheKey = this.generateCacheKey(callParams);
    if (this.offlineMode && this.offlineCache.has(cacheKey)) {
      this.fallbackStats.cachedResults++;
      return {
        success: true,
        source: "offline-cache",
        data: this.offlineCache.get(cacheKey),
        timestamp: new Date().toISOString(),
      };
    }

    // Try fallback chain
    for (let i = 0; i < this.fallbackChain.length; i++) {
      const serverIndex =
        (this.currentPrimaryIndex + i) % this.fallbackChain.length;
      const server = this.fallbackChain[serverIndex];

      try {
        const result = await this.callServer(server, callParams, timeout);

        if (result.success) {
          this.fallbackStats.successfulCalls++;
          this.consecutiveErrors = 0;

          // Update cache
          if (this.cacheResults) {
            this.cacheResult(cacheKey, result.data);
          }

          return {
            success: true,
            data: result.data,
            source: "server-" + server.priority,
            server: server.id,
            timestamp: new Date().toISOString(),
          };
        }
      } catch (error) {
        this.lastConnectionError = error.message;
        this.consecutiveErrors++;

        // Check if we should switch to offline mode
        if (this.consecutiveErrors >= this.failoverThreshold) {
          this.switchToOfflineMode();
        }

        // Try next server
        continue;
      }
    }

    // All servers failed - use offline cache or error
    if (this.cacheResults && this.offlineCache.has(cacheKey)) {
      this.fallbackStats.cachedResults++;
      return {
        success: true,
        data: this.offlineCache.get(cacheKey),
        source: "offline-cache-fallback",
        timestamp: new Date().toISOString(),
        warning: "Using cached result (all servers unavailable)",
      };
    }

    return {
      success: false,
      error: "All servers in fallback chain failed",
      lastError: this.lastConnectionError,
      serversAttempted: this.fallbackChain.length,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  /**
   * Simulate call to server
   */
  async callServer(server, callParams, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Server ${server.id} timeout after ${timeout}ms`));
      }, timeout);

      try {
        // Simulate server call (in real impl, would make actual RPC call)
        if (!server.available) {
          clearTimeout(timeoutHandle);
          reject(new Error(`Server ${server.id} is unavailable`));
          return;
        }

        // Simulate success
        clearTimeout(timeoutHandle);
        resolve({
          success: true,
          data: {
            result: callParams,
            processedBy: server.id,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * Generate cache key
   */
  generateCacheKey(callParams) {
    // Simple hash of call params
    return JSON.stringify(callParams);
  }

  /**
   * Cache result
   */
  cacheResult(cacheKey, data) {
    this.offlineCache.set(cacheKey, {
      ...data,
      cachedAt: new Date().toISOString(),
    });

    // Limit cache size to 1000 entries
    if (this.offlineCache.size > 1000) {
      const firstKey = this.offlineCache.keys().next().value;
      this.offlineCache.delete(firstKey);
    }
  }

  /**
   * Switch to offline mode
   */
  switchToOfflineMode() {
    if (!this.offlineMode) {
      this.offlineMode = true;
      this.fallbackStats.offlineModeSwitches++;
    }
  }

  /**
   * Attempt recovery to online mode
   */
  async attemptRecovery() {
    for (let i = 0; i < this.fallbackChain.length; i++) {
      const server = this.fallbackChain[i];

      try {
        const result = await this.callServer(server, { ping: true }, 5000);

        if (result.success) {
          this.offlineMode = false;
          this.consecutiveErrors = 0;
          this.currentPrimaryIndex = i;

          return {
            success: true,
            message: "Recovered to online mode",
            primaryServer: server.id,
          };
        }
      } catch (error) {
        // This server also unavailable, try next
        continue;
      }
    }

    return {
      success: false,
      message: "Could not recover to online mode - all servers unavailable",
    };
  }

  /**
   * Mark server as unavailable
   */
  markServerUnavailable(serverId) {
    const server = this.fallbackChain.find((s) => s.id === serverId);
    if (server) {
      server.available = false;
    }

    return { success: true };
  }

  /**
   * Mark server as available
   */
  markServerAvailable(serverId) {
    const server = this.fallbackChain.find((s) => s.id === serverId);
    if (server) {
      server.available = true;
    }

    return { success: true };
  }

  /**
   * Get fallback status
   */
  getStatus() {
    const availableServers = this.fallbackChain.filter((s) => s.available);
    const unavailableServers = this.fallbackChain.filter((s) => !s.available);

    return {
      offlineMode: this.offlineMode,
      availableServers: availableServers.length,
      unavailableServers: unavailableServers.length,
      totalServers: this.fallbackChain.length,
      cachedEntries: this.offlineCache.size,
      consecutiveErrors: this.consecutiveErrors,
      primaryServerIndex: this.currentPrimaryIndex,
      lastError: this.lastConnectionError,
    };
  }

  /**
   * Get stats
   */
  getStats() {
    const successRate =
      this.fallbackStats.totalAttempts > 0
        ? (
            (this.fallbackStats.successfulCalls /
              this.fallbackStats.totalAttempts) *
            100
          ).toFixed(2)
        : 0;

    return {
      ...this.fallbackStats,
      successRate: parseFloat(successRate) + "%",
      cacheSize: this.offlineCache.size,
    };
  }

  /**
   * Clear offline cache
   */
  clearOfflineCache() {
    const cacheSize = this.offlineCache.size;
    this.offlineCache.clear();
    return { success: true, clearedEntries: cacheSize };
  }
}

export const mcpOfflineFallback = new MCPOfflineFallback();

export default { MCPOfflineFallback, mcpOfflineFallback };
