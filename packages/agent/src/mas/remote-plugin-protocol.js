"use strict";

/**
 * CodeIn Remote Plugin Protocol v1
 *
 * Defines the contract for external plugins communicating with CodeIn
 * over HTTP or WebSocket. Plugins register capabilities, subscribe to
 * hooks, and receive lifecycle events.
 *
 * Transport: JSON over HTTP POST or WebSocket frames
 */

const PROTOCOL_VERSION = 1;

/** Message types in the protocol */
const MESSAGE_TYPE = Object.freeze({
  // Plugin → CodeIn
  REGISTER: "plugin:register",
  UNREGISTER: "plugin:unregister",
  HOOK_SUBSCRIBE: "hook:subscribe",
  HOOK_UNSUBSCRIBE: "hook:unsubscribe",
  HOOK_RESPONSE: "hook:response",
  HEARTBEAT: "plugin:heartbeat",

  // CodeIn → Plugin
  REGISTERED: "plugin:registered",
  HOOK_DISPATCH: "hook:dispatch",
  LIFECYCLE: "lifecycle",
  ERROR: "error",
  PONG: "pong",
});

/** Plugin capability declarations */
const PLUGIN_CAPABILITY = Object.freeze({
  HOOK_LISTENER: "hook_listener",
  TOOL_PROVIDER: "tool_provider",
  MODEL_PROVIDER: "model_provider",
  UI_EXTENSION: "ui_extension",
});

/**
 * Create a registration message.
 * Plugin sends this to CodeIn to register itself.
 */
function createRegistration(pluginInfo) {
  return {
    protocol: PROTOCOL_VERSION,
    type: MESSAGE_TYPE.REGISTER,
    timestamp: Date.now(),
    payload: {
      name: pluginInfo.name,
      version: pluginInfo.version || "1.0.0",
      capabilities: pluginInfo.capabilities || [],
      hooks: pluginInfo.hooks || [], // hook event names to subscribe to
      healthEndpoint: pluginInfo.healthEndpoint || null,
      metadata: pluginInfo.metadata || {},
    },
  };
}

/**
 * Create a hook dispatch message.
 * CodeIn sends this to plugins when a hook event occurs.
 */
function createHookDispatch(hookEvent, data, requestId) {
  return {
    protocol: PROTOCOL_VERSION,
    type: MESSAGE_TYPE.HOOK_DISPATCH,
    timestamp: Date.now(),
    requestId,
    payload: {
      event: hookEvent,
      data,
    },
  };
}

/**
 * Create a hook response.
 * Plugin sends this back after processing a hook dispatch.
 */
function createHookResponse(requestId, result) {
  return {
    protocol: PROTOCOL_VERSION,
    type: MESSAGE_TYPE.HOOK_RESPONSE,
    timestamp: Date.now(),
    requestId,
    payload: {
      success: result.success !== false,
      data: result.data || null,
      error: result.error || null,
    },
  };
}

/**
 * Validate an incoming protocol message.
 * Returns { valid: boolean, errors: string[] }
 */
function validateMessage(msg) {
  const errors = [];
  if (!msg || typeof msg !== "object") {
    return { valid: false, errors: ["Message must be an object"] };
  }
  if (msg.protocol !== PROTOCOL_VERSION) {
    errors.push(
      `Unsupported protocol version: ${msg.protocol} (expected ${PROTOCOL_VERSION})`,
    );
  }
  if (!Object.values(MESSAGE_TYPE).includes(msg.type)) {
    errors.push(`Unknown message type: ${msg.type}`);
  }
  if (!msg.timestamp || typeof msg.timestamp !== "number") {
    errors.push("Missing or invalid timestamp");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * RemotePluginHost — manages remote plugin connections.
 * Integrates with PluginHookManager for hook dispatch.
 */
class RemotePluginHost {
  constructor(opts = {}) {
    this._plugins = new Map(); // pluginName -> { registration, connection, lastHeartbeat }
    this._hookSubscriptions = new Map(); // hookEvent -> Set<pluginName>
    this._timeout = opts.timeout || 5000; // ms to wait for hook responses
    this._maxPlugins = opts.maxPlugins || 50;
  }

  /**
   * Register a remote plugin.
   * @param {object} registration — validated registration message payload
   * @param {object} connection — transport handle (HTTP callback URL or WebSocket ref)
   * @returns {{ success: boolean, pluginId: string, error?: string }}
   */
  register(registration, connection) {
    if (this._plugins.size >= this._maxPlugins) {
      return { success: false, error: "Maximum plugin limit reached" };
    }
    const name = registration.name;
    if (!name || typeof name !== "string" || name.length > 100) {
      return { success: false, error: "Invalid plugin name" };
    }
    // Validate capabilities
    if (registration.capabilities) {
      for (const cap of registration.capabilities) {
        if (!Object.values(PLUGIN_CAPABILITY).includes(cap)) {
          return { success: false, error: `Unknown capability: ${cap}` };
        }
      }
    }

    this._plugins.set(name, {
      registration,
      connection,
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
    });

    // Subscribe to requested hooks
    if (Array.isArray(registration.hooks)) {
      for (const hookEvent of registration.hooks) {
        if (!this._hookSubscriptions.has(hookEvent)) {
          this._hookSubscriptions.set(hookEvent, new Set());
        }
        this._hookSubscriptions.get(hookEvent).add(name);
      }
    }

    return { success: true, pluginId: name };
  }

  /**
   * Unregister a remote plugin.
   */
  unregister(pluginName) {
    this._plugins.delete(pluginName);
    for (const [, subs] of this._hookSubscriptions) {
      subs.delete(pluginName);
    }
    return { success: true };
  }

  /**
   * Dispatch a hook event to all subscribed remote plugins.
   * Returns aggregated results.
   */
  async dispatch(hookEvent, data) {
    const subscribers = this._hookSubscriptions.get(hookEvent);
    if (!subscribers || subscribers.size === 0) return [];

    const results = [];
    for (const pluginName of subscribers) {
      const plugin = this._plugins.get(pluginName);
      if (!plugin) continue;

      try {
        // In HTTP mode, POST to plugin's callback URL
        if (plugin.connection.callbackUrl) {
          const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const msg = createHookDispatch(hookEvent, data, requestId);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this._timeout);

          try {
            const response = await fetch(plugin.connection.callbackUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(msg),
              signal: controller.signal,
            });
            clearTimeout(timer);
            const result = await response.json();
            results.push({ plugin: pluginName, ...result });
          } catch (fetchErr) {
            clearTimeout(timer);
            results.push({
              plugin: pluginName,
              success: false,
              error:
                fetchErr.name === "AbortError" ? "Timeout" : fetchErr.message,
            });
          }
        }
      } catch (err) {
        results.push({
          plugin: pluginName,
          success: false,
          error: err.message,
        });
      }
    }
    return results;
  }

  /** List registered plugins */
  listPlugins() {
    return Array.from(this._plugins.entries()).map(([name, info]) => ({
      name,
      capabilities: info.registration.capabilities,
      hooks: info.registration.hooks,
      registeredAt: info.registeredAt,
      lastHeartbeat: info.lastHeartbeat,
    }));
  }

  /** Record a heartbeat from a plugin */
  heartbeat(pluginName) {
    const plugin = this._plugins.get(pluginName);
    if (plugin) {
      plugin.lastHeartbeat = Date.now();
      return true;
    }
    return false;
  }

  /** Prune plugins that haven't sent a heartbeat in given interval */
  pruneStale(maxAgeMs = 300000) {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [name, info] of this._plugins) {
      if (info.lastHeartbeat < cutoff) {
        this.unregister(name);
        pruned++;
      }
    }
    return pruned;
  }

  /** Shutdown all plugins */
  shutdown() {
    this._plugins.clear();
    this._hookSubscriptions.clear();
  }
}

module.exports = {
  PROTOCOL_VERSION,
  MESSAGE_TYPE,
  PLUGIN_CAPABILITY,
  createRegistration,
  createHookDispatch,
  createHookResponse,
  validateMessage,
  RemotePluginHost,
};
