/**
 * CodIn MAS — Expanded Plugin Hook System
 *
 * Provides lifecycle hooks that plugins can subscribe to:
 * - task:start / task:finish
 * - agent:spawn / agent:complete
 * - permission:request / permission:response
 * - cost:threshold
 * - node:start / node:finish
 * - memory:write
 * - swarm:init / swarm:shutdown
 *
 * Hooks run in-band (sync or await) with timeouts to prevent stalls.
 */
"use strict";

const HOOK_TIMEOUT_MS = 5000; // Max 5s per hook handler

/**
 * All supported lifecycle hooks.
 */
const HOOK_EVENT = Object.freeze({
  TASK_START: "task:start",
  TASK_FINISH: "task:finish",
  AGENT_SPAWN: "agent:spawn",
  AGENT_COMPLETE: "agent:complete",
  PERMISSION_REQUEST: "permission:request",
  PERMISSION_RESPONSE: "permission:response",
  COST_THRESHOLD: "cost:threshold",
  NODE_START: "node:start",
  NODE_FINISH: "node:finish",
  MEMORY_WRITE: "memory:write",
  SWARM_INIT: "swarm:init",
  SWARM_SHUTDOWN: "swarm:shutdown",
});

class PluginHookManager {
  constructor(opts = {}) {
    /** @type {Map<string, Array<{pluginName: string, handler: Function, priority: number}>>} */
    this._hooks = new Map();
    this._logger = opts.logger || console;
    this._timeout = opts.timeout || HOOK_TIMEOUT_MS;

    // Initialize all hook event maps
    for (const event of Object.values(HOOK_EVENT)) {
      this._hooks.set(event, []);
    }
  }

  /**
   * Register a hook handler.
   * @param {string} event — Hook event name (from HOOK_EVENT)
   * @param {string} pluginName — Plugin registering the hook
   * @param {Function} handler — (context) => void | Promise<void>
   * @param {object} opts — { priority: number } (lower = runs first)
   */
  register(event, pluginName, handler, opts = {}) {
    if (!this._hooks.has(event)) {
      throw new Error(`Unknown hook event: ${event}`);
    }
    if (typeof handler !== "function") {
      throw new Error("Hook handler must be a function");
    }

    const priority = opts.priority ?? 100;
    const handlers = this._hooks.get(event);

    // Prevent duplicate registration
    const existing = handlers.findIndex(
      (h) => h.pluginName === pluginName && h.handler === handler,
    );
    if (existing >= 0) return;

    handlers.push({ pluginName, handler, priority });
    handlers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Unregister all hooks for a plugin.
   * @param {string} pluginName
   */
  unregister(pluginName) {
    for (const [event, handlers] of this._hooks) {
      this._hooks.set(
        event,
        handlers.filter((h) => h.pluginName !== pluginName),
      );
    }
  }

  /**
   * Unregister a specific hook.
   * @param {string} event
   * @param {string} pluginName
   */
  unregisterHook(event, pluginName) {
    if (!this._hooks.has(event)) return;
    const handlers = this._hooks.get(event);
    this._hooks.set(
      event,
      handlers.filter((h) => h.pluginName !== pluginName),
    );
  }

  /**
   * Emit a hook event. All registered handlers are called in priority order.
   * Handlers are given a timeout; failures are logged but don't break the pipeline.
   *
   * @param {string} event — Hook event name
   * @param {object} context — Event context data
   * @returns {Promise<{results: Array, errors: Array}>}
   */
  async emit(event, context = {}) {
    const handlers = this._hooks.get(event);
    if (!handlers || handlers.length === 0) {
      return { results: [], errors: [] };
    }

    const results = [];
    const errors = [];

    for (const { pluginName, handler } of handlers) {
      try {
        const result = await this._runWithTimeout(
          handler,
          { ...context, event, pluginName },
          this._timeout,
        );
        results.push({ pluginName, result });
      } catch (err) {
        const error = {
          pluginName,
          event,
          error: err.message || String(err),
        };
        errors.push(error);
        this._logger.warn?.(
          `[PluginHook] ${pluginName} failed on ${event}: ${err.message}`,
        );
      }
    }

    return { results, errors };
  }

  /**
   * Emit a hook that can modify context (pipe pattern).
   * Each handler receives the output of the previous one.
   *
   * @param {string} event
   * @param {object} context — Initial context, will be passed through handlers
   * @returns {Promise<object>} — Final context after all handlers
   */
  async emitPipe(event, context = {}) {
    const handlers = this._hooks.get(event);
    if (!handlers || handlers.length === 0) return context;

    let current = { ...context };

    for (const { pluginName, handler } of handlers) {
      try {
        const result = await this._runWithTimeout(
          handler,
          { ...current, event, pluginName },
          this._timeout,
        );
        // Merge result into context if handler returns an object
        if (result && typeof result === "object") {
          current = { ...current, ...result };
        }
      } catch (err) {
        this._logger.warn?.(
          `[PluginHook] ${pluginName} pipe failed on ${event}: ${err.message}`,
        );
        // Continue with unchanged context
      }
    }

    return current;
  }

  /**
   * Check if any handlers are registered for an event.
   */
  hasHandlers(event) {
    const handlers = this._hooks.get(event);
    return !!handlers && handlers.length > 0;
  }

  /**
   * List all registered hooks (for debugging/admin).
   */
  listHooks() {
    const result = {};
    for (const [event, handlers] of this._hooks) {
      if (handlers.length > 0) {
        result[event] = handlers.map((h) => ({
          plugin: h.pluginName,
          priority: h.priority,
        }));
      }
    }
    return result;
  }

  /**
   * Get hook count by event.
   */
  stats() {
    const stats = {};
    for (const [event, handlers] of this._hooks) {
      stats[event] = handlers.length;
    }
    return stats;
  }

  /**
   * Clear all hooks.
   */
  clear() {
    for (const event of this._hooks.keys()) {
      this._hooks.set(event, []);
    }
  }

  /**
   * Run a handler with a timeout.
   * @private
   */
  async _runWithTimeout(handler, context, timeout) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Hook timed out after ${timeout}ms`));
        }
      }, timeout);

      try {
        const result = handler(context);
        if (result && typeof result.then === "function") {
          result
            .then((val) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(val);
              }
            })
            .catch((err) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
              }
            });
        } else {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(result);
          }
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });
  }
}

module.exports = { PluginHookManager, HOOK_EVENT };
