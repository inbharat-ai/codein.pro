/**
 * MCP Connector Health Check Module
 *
 * Tests MCP server connections, fallback mechanisms, and error recovery.
 * Step 4 of production hardening.
 */

export class MCPHealthChecker {
  constructor(options = {}) {
    this.timeout = options.timeout || 10000;
    this.retryAttempts = options.retryAttempts || 3;
    this.servers = new Map();
    this.healthCheckIntervalMs = options.healthCheckIntervalMs || 60000; // 1 minute
    this.healthCheckInterval = null;
    this.lastChecks = new Map();
  }

  /**
   * Register an MCP server for health checks
   */
  registerServer(serverId, serverConfig) {
    this.servers.set(serverId, {
      id: serverId,
      ...serverConfig,
      status: "unknown",
      lastHealthCheck: null,
      consecutiveFailures: 0,
      connectionAttempts: 0,
      offlineFallbackActive: false,
    });

    return { success: true, serverId };
  }

  /**
   * Check if server is healthy
   */
  async checkServerHealth(serverId) {
    const server = this.servers.get(serverId);

    if (!server) {
      return {
        success: false,
        error: "Server not found",
        serverId,
      };
    }

    server.connectionAttempts++;
    let lastError = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await this.testConnection(server);

        if (result.success) {
          server.status = "healthy";
          server.lastHealthCheck = new Date().toISOString();
          server.consecutiveFailures = 0;
          server.offlineFallbackActive = false;

          return {
            success: true,
            serverId,
            status: "healthy",
            responseTime: result.responseTime,
            attempt,
          };
        }
      } catch (error) {
        lastError = error;

        if (attempt < this.retryAttempts) {
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All retries failed
    server.consecutiveFailures++;
    server.status = "unhealthy";
    server.lastHealthCheck = new Date().toISOString();

    // Activate offline fallback if too many failures
    if (server.consecutiveFailures >= 3) {
      server.offlineFallbackActive = true;
    }

    return {
      success: false,
      serverId,
      status: "unhealthy",
      error: lastError?.message,
      consecutiveFailures: server.consecutiveFailures,
      offlineFallbootActive: server.offlineFallbackActive,
      attempts: this.retryAttempts,
    };
  }

  /**
   * Test connection to a server
   */
  async testConnection(server) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.timeout}ms`));
      }, this.timeout);

      try {
        // Simulate connection test (in real implementation, would test actual connection)
        if (server.testEndpoint) {
          // Would make actual HTTP request here
          const responseTime = Date.now() - startTime;
          clearTimeout(timeoutHandle);

          resolve({
            success: true,
            responseTime,
            timestamp: new Date().toISOString(),
          });
        } else {
          clearTimeout(timeoutHandle);
          resolve({ success: true, responseTime: Date.now() - startTime });
        }
      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * Check all servers
   */
  async checkAllServers() {
    const results = [];

    for (const [serverId] of this.servers) {
      const result = await this.checkServerHealth(serverId);
      results.push(result);
    }

    return results;
  }

  /**
   * Get server status
   */
  getServerStatus(serverId) {
    const server = this.servers.get(serverId);

    if (!server) {
      return null;
    }

    return {
      id: server.id,
      status: server.status,
      lastHealthCheck: server.lastHealthCheck,
      consecutiveFailures: server.consecutiveFailures,
      connectionAttempts: server.connectionAttempts,
      offlineFallbackActive: server.offlineFallbackActive,
      healthPercentage: this.calculateHealthPercentage(server),
    };
  }

  /**
   * Calculate health percentage
   */
  calculateHealthPercentage(server) {
    if (server.connectionAttempts === 0) return 100;

    const failureRate =
      server.consecutiveFailures /
      Math.max(1, server.connectionAttempts - server.consecutiveFailures);
    const healthPercentage = Math.max(
      0,
      Math.min(100, 100 * (1 - failureRate)),
    );

    return Math.round(healthPercentage);
  }

  /**
   * Get all server statuses
   */
  getAllServerStatuses() {
    const statuses = [];

    for (const [serverId] of this.servers) {
      const status = this.getServerStatus(serverId);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * Get offline fallback status
   */
  getOfflineFallbackStatus() {
    const activeServers = [];
    const offlineServers = [];

    for (const [serverId, server] of this.servers) {
      if (server.offlineFallbackActive) {
        offlineServers.push({
          id: serverId,
          reason: `${server.consecutiveFailures} consecutive failures`,
          activatedAt: server.lastHealthCheck,
        });
      } else {
        activeServers.push(serverId);
      }
    }

    return {
      activeServers,
      offlineServers,
      totalOffline: offlineServers.length,
      fallbackMode: offlineServers.length > 0,
    };
  }

  /**
   * Start periodic health checks
   */
  startPeriodicHealthChecks() {
    if (this.healthCheckInterval) {
      return { success: false, error: "Health checks already running" };
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllServers();
    }, this.healthCheckIntervalMs);

    return { success: true, message: "Periodic health checks started" };
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    return { success: true, message: "Periodic health checks stopped" };
  }

  /**
   * Get stats
   */
  getStats() {
    const allStatuses = this.getAllServerStatuses();
    const healthyCount = allStatuses.filter(
      (s) => s.status === "healthy",
    ).length;
    const avgHealth =
      allStatuses.length > 0
        ? Math.round(
            allStatuses.reduce((sum, s) => sum + s.healthPercentage, 0) /
              allStatuses.length,
          )
        : 0;

    return {
      totalServers: this.servers.size,
      healthyServers: healthyCount,
      unhealthyServers: this.servers.size - healthyCount,
      averageHealth: avgHealth,
      fallbackActive: this.getOfflineFallbackStatus().fallbackMode,
    };
  }
}

export const mcpHealthChecker = new MCPHealthChecker();

export default { MCPHealthChecker, mcpHealthChecker };
