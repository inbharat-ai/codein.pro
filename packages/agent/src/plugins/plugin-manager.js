const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

/**
 * @class PluginManager
 * @description Manages dynamic plugin loading, execution, and lifecycle
 * @extends EventEmitter
 * @example
 * const pm = new PluginManager({ pluginDir: './plugins' });
 * await pm.initialize();
 * const result = await pm.executePlugin('myPlugin', { data: 'test' });
 */
class PluginManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.pluginDir = options.pluginDir || path.join(process.cwd(), "plugins");
    this.timeout = options.timeout || 30000;
    this.enableSandbox = options.enableSandbox !== false;

    this.plugins = new Map();
    this.hooks = new Map();
    this.executionStats = {
      total: 0,
      success: 0,
      failed: 0,
      timeout: 0,
    };

    this.initializePluginDir();
  }

  /**
   * Initialize plugin directory
   * @private
   */
  initializePluginDir() {
    try {
      if (!fs.existsSync(this.pluginDir)) {
        fs.mkdirSync(this.pluginDir, { recursive: true, mode: 0o700 });
      }
    } catch (error) {
      console.error(
        "[PluginManager] Failed to initialize plugin directory:",
        error.message,
      );
    }
  }

  /**
   * Initialize plugin manager and load all plugins
   * @returns {Promise}
   */
  async initialize() {
    try {
      const files = fs
        .readdirSync(this.pluginDir)
        .filter((f) => f.endsWith(".js"))
        .sort();

      for (const file of files) {
        await this.loadPlugin(file);
      }

      this.emit("init-complete", { loadedPlugins: this.plugins.size });
      return { success: true, loaded: this.plugins.size };
    } catch (error) {
      this.emit("init-error", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Load plugin from file
   * @param {string} pluginName - Plugin name or filename
   * @returns {Promise}
   */
  async loadPlugin(pluginName) {
    try {
      const filePath = path.join(this.pluginDir, pluginName);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Plugin file not found: ${pluginName}`);
      }

      // Clear require cache for reload support
      delete require.cache[path.resolve(filePath)];

      const pluginModule = require(path.resolve(filePath));
      const pluginConfig = pluginModule.config || { name: pluginName };

      // Check dependencies
      if (pluginConfig.dependencies) {
        this.resolveDependencies(pluginConfig.dependencies);
      }

      this.plugins.set(pluginConfig.name, {
        ...pluginConfig,
        module: pluginModule,
        filePath,
        loaded: Date.now(),
        stats: { executions: 0, errors: 0, totalTime: 0 },
      });

      // Call plugin initialization
      if (pluginModule.initialize) {
        await pluginModule.initialize({
          registerHook: this.registerHook.bind(this),
          emit: this.emit.bind(this),
        });
      }

      this.emit("plugin-loaded", { plugin: pluginConfig.name });
      return { success: true, plugin: pluginConfig.name };
    } catch (error) {
      this.emit("plugin-error", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Resolve plugin dependencies
   * @private
   */
  resolveDependencies(dependencies, visited = new Set()) {
    for (const dep of dependencies) {
      if (visited.has(dep)) {
        throw new Error(`Circular dependency detected: ${dep}`);
      }

      if (!this.plugins.has(dep)) {
        throw new Error(`Missing dependency: ${dep}`);
      }

      visited.add(dep);
      const depPlugin = this.plugins.get(dep);

      if (depPlugin.config?.dependencies) {
        this.resolveDependencies(depPlugin.config.dependencies, visited);
      }
    }
  }

  /**
   * Execute plugin
   * @param {string} pluginName - Plugin name
   * @param {*} input - Input to plugin
   * @param {Object} options - Execution options
   * @returns {Promise} Plugin result
   */
  async executePlugin(pluginName, input, options = {}) {
    const { timeout = this.timeout, context = {}, async = true } = options;

    const plugin = this.plugins.get(pluginName);

    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    if (!plugin.module.execute) {
      throw new Error(`Plugin has no execute function: ${pluginName}`);
    }

    const startTime = Date.now();
    this.executionStats.total++;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.executionStats.timeout++;
        plugin.stats.errors++;
        reject(new Error(`Plugin execution timeout: ${pluginName}`));
      }, timeout);

      try {
        const result = plugin.module.execute(input, {
          ...context,
          emit: this.emit.bind(this),
          getPlugin: (name) => this.plugins.get(name),
        });

        if (result instanceof Promise) {
          result
            .then((res) => {
              clearTimeout(timeoutId);
              const duration = Date.now() - startTime;
              plugin.stats.executions++;
              plugin.stats.totalTime += duration;
              this.executionStats.success++;
              this.emit("plugin-executed", { plugin: pluginName, duration });
              resolve(res);
            })
            .catch((error) => {
              clearTimeout(timeoutId);
              plugin.stats.errors++;
              this.executionStats.failed++;
              this.emit("plugin-error", {
                plugin: pluginName,
                error: error.message,
              });
              reject(error);
            });
        } else {
          clearTimeout(timeoutId);
          const duration = Date.now() - startTime;
          plugin.stats.executions++;
          plugin.stats.totalTime += duration;
          this.executionStats.success++;
          this.emit("plugin-executed", { plugin: pluginName, duration });
          resolve(result);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        plugin.stats.errors++;
        this.executionStats.failed++;
        this.emit("plugin-error", { plugin: pluginName, error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Register hook for plugins
   * @param {string} hookName - Hook name
   * @param {Function} callback - Hook callback
   * @param {Object} options - Hook options
   */
  registerHook(hookName, callback, options = {}) {
    const { priority = 0 } = options;

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    this.hooks.get(hookName).push({ callback, priority });
    this.hooks.get(hookName).sort((a, b) => b.priority - a.priority);

    this.emit("hook-registered", { hook: hookName, priority });
  }

  /**
   * Execute all hooks for an event
   * @param {string} hookName - Hook name
   * @param {*} data - Data to pass to hooks
   * @returns {Promise} Array of hook results
   */
  async executeHooks(hookName, data) {
    const hooks = this.hooks.get(hookName) || [];
    const results = [];

    for (const { callback } of hooks) {
      try {
        const result = await Promise.resolve(callback(data));
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Shutdown all plugins
   * @returns {Promise}
   */
  async shutdownAll() {
    for (const [name, plugin] of this.plugins.entries()) {
      try {
        if (plugin.module.shutdown) {
          await plugin.module.shutdown();
        }
        this.emit("plugin-shutdown", { plugin: name });
      } catch (error) {
        console.error(`Error shutting down plugin ${name}:`, error.message);
      }
    }

    this.plugins.clear();
    this.hooks.clear();
  }

  /**
   * Get plugin metadata
   * @param {string} pluginName - Plugin name
   * @returns {Object} Plugin metadata
   */
  getPluginMetadata(pluginName) {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) {
      return null;
    }

    return {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      dependencies: plugin.dependencies || [],
      permissions: plugin.permissions || [],
      stats: plugin.stats,
      loaded: new Date(plugin.loaded),
    };
  }

  /**
   * List all loaded plugins
   * @returns {Object[]} Array of plugin info
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map((plugin) => ({
      name: plugin.name,
      version: plugin.version,
      stats: plugin.stats,
    }));
  }

  /**
   * Unload specific plugin
   * @param {string} pluginName - Plugin name
   * @returns {Promise}
   */
  async unloadPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    try {
      if (plugin.module.shutdown) {
        await plugin.module.shutdown();
      }

      this.plugins.delete(pluginName);
      this.emit("plugin-unloaded", { plugin: pluginName });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get execution statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.executionStats,
      successRate:
        this.executionStats.total > 0
          ? (
              (this.executionStats.success / this.executionStats.total) *
              100
            ).toFixed(2) + "%"
          : "N/A",
      plugins: this.plugins.size,
      hooks: this.hooks.size,
    };
  }
}

module.exports = { PluginManager };
