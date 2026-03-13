/**
 * CodIn MAS — Structured Logger
 *
 * Replaces raw console.log/error/warn with structured, level-aware logging.
 * Outputs JSON lines in production, human-readable in development.
 * All log entries carry timestamp, level, component, and optional context.
 */
"use strict";

const LOG_LEVEL = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
});

const LEVEL_NAMES = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

/** Global minimum log level — set via CODIN_LOG_LEVEL env var */
let _minLevel =
  LOG_LEVEL[(process.env.CODIN_LOG_LEVEL || "INFO").toUpperCase()] ??
  LOG_LEVEL.INFO;

/**
 * Create a logger scoped to a component.
 * @param {string} component — e.g. "SwarmManager", "PermissionGate", "CoderAgent"
 * @returns {object} Logger with debug/info/warn/error/fatal methods
 */
function createLogger(component) {
  const isProduction = process.env.NODE_ENV === "production";

  function _log(level, message, context = {}) {
    if (level < _minLevel) return;

    const entry = {
      ts: new Date().toISOString(),
      level: LEVEL_NAMES[level],
      component,
      msg: message,
      ...context,
    };

    if (isProduction) {
      // JSON lines for structured log aggregation
      const stream = level >= LOG_LEVEL.ERROR ? process.stderr : process.stdout;
      stream.write(JSON.stringify(entry) + "\n");
    } else {
      // Human-readable for development
      const prefix = `[${entry.ts.slice(11, 23)}] ${LEVEL_NAMES[level].padEnd(5)} [${component}]`;
      const contextStr =
        Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
      const stream = level >= LOG_LEVEL.ERROR ? process.stderr : process.stdout;
      stream.write(`${prefix} ${message}${contextStr}\n`);
    }
  }

  return {
    debug: (msg, ctx) => _log(LOG_LEVEL.DEBUG, msg, ctx),
    info: (msg, ctx) => _log(LOG_LEVEL.INFO, msg, ctx),
    warn: (msg, ctx) => _log(LOG_LEVEL.WARN, msg, ctx),
    error: (msg, ctx) => _log(LOG_LEVEL.ERROR, msg, ctx),
    fatal: (msg, ctx) => _log(LOG_LEVEL.FATAL, msg, ctx),

    /** Create a child logger with additional default context */
    child: (childContext) => {
      const parent = createLogger(component);
      const original = parent;
      for (const method of ["debug", "info", "warn", "error", "fatal"]) {
        parent[method] = (msg, ctx = {}) =>
          original[method](msg, { ...childContext, ...ctx });
      }
      return parent;
    },
  };
}

/**
 * Set the global minimum log level at runtime.
 * @param {string} levelName — "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL"
 */
function setLogLevel(levelName) {
  const level = LOG_LEVEL[levelName.toUpperCase()];
  if (level === undefined) {
    throw new Error(`Invalid log level: ${levelName}`);
  }
  _minLevel = level;
}

module.exports = { createLogger, setLogLevel, LOG_LEVEL };
