/**
 * Graceful shutdown handler.
 * Extracted from index.js.
 */
"use strict";

const { logger } = require("./logger");

/**
 * Create a shutdown handler and register SIGTERM/SIGINT listeners.
 * @param {import("node:http").Server} server - HTTP server instance
 * @param {object} deps
 * @param {Function} deps.getSwarmManager - Returns the swarmManager (may be null).
 *   Using a getter avoids the bug where swarmManager is undefined at module-load
 *   time because it's created lazily inside the swarm route module.
 * @param {object|null} deps.processManager
 * @param {object|null} deps.rateLimiter
 * @param {object|null} deps.sandbox
 */
function createShutdownHandler(server, deps) {
  const { getSwarmManager, processManager, rateLimiter, sandbox } = deps;
  let _shutdownStarted = false;

  async function gracefulShutdown(signal) {
    if (_shutdownStarted) return;
    _shutdownStarted = true;
    logger.info({ signal }, "Graceful shutdown initiated");

    // 1. Stop accepting new connections
    server.close(() => {
      logger.info("HTTP server closed");
    });

    // 2. Force-close after 30 seconds
    const forceTimer = setTimeout(() => {
      logger.warn("Forced exit after 30s shutdown timeout");
      process.exit(1);
    }, 30_000);
    forceTimer.unref();

    // 3. Shutdown subsystems with individual timeouts
    const withTimeout = (promise, ms, name) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${name} shutdown timeout`)), ms),
        ),
      ]).catch((err) =>
        logger.warn({ error: err.message }, `${name} shutdown failed`),
      );

    const shutdownTasks = [];

    // FIX: Use getter to resolve swarmManager at shutdown time, not at
    // registration time (when it was always undefined).
    const swarmManager =
      typeof getSwarmManager === "function" ? getSwarmManager() : null;

    if (typeof swarmManager?.swarmShutdown === "function") {
      shutdownTasks.push(
        withTimeout(
          Promise.resolve(swarmManager.swarmShutdown()),
          10_000,
          "SwarmManager",
        ),
      );
    }
    if (typeof processManager?.destroy === "function") {
      shutdownTasks.push(
        withTimeout(
          Promise.resolve(processManager.destroy()),
          5_000,
          "ProcessManager",
        ),
      );
    }
    if (typeof rateLimiter?.destroy === "function") {
      rateLimiter.destroy();
    }
    if (typeof sandbox?.terminateAll === "function") {
      shutdownTasks.push(
        withTimeout(Promise.resolve(sandbox.terminateAll()), 5_000, "Sandbox"),
      );
    }

    await Promise.allSettled(shutdownTasks);

    clearTimeout(forceTimer);
    logger.info("Shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  return gracefulShutdown;
}

module.exports = { createShutdownHandler };
