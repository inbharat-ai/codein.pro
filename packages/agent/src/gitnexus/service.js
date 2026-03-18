/**
 * GitNexus Integration Service
 *
 * Thin wrapper around the GitNexus CLI for code-intelligence graph features.
 * GitNexus runs as an external MCP server (PolyForm Noncommercial license —
 * we must NOT embed its source code, only communicate via CLI / MCP protocol).
 *
 * Capabilities:
 *   - Auto-detect whether `gitnexus` is installed
 *   - Index a repository (spawn `npx gitnexus analyze`)
 *   - Check staleness (git rev-list count since last indexed commit)
 *   - Register GitNexus as an MCP server in CodeIn's MCP client manager
 *   - Trigger re-index when stale
 *   - Graceful degradation when GitNexus is unavailable
 */
"use strict";

const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");

const execFileAsync = promisify(execFile);

/** Default MCP server configuration for GitNexus */
const GITNEXUS_MCP_CONFIG = {
  command: "npx",
  args: ["-y", "gitnexus@latest", "mcp"],
  env: {},
  enabled: true,
};

/** Name used in MCP server registry */
const GITNEXUS_SERVER_NAME = "gitnexus";

/** Index directory created by GitNexus inside a repo */
const GITNEXUS_INDEX_DIR = ".gitnexus";

/** Maximum staleness (commits behind) before auto-reindex suggestion */
const STALENESS_THRESHOLD = 10;

/**
 * @typedef {Object} GitNexusStatus
 * @property {boolean}  installed       - Whether gitnexus CLI is available
 * @property {string|null} version      - Installed version (null if not installed)
 * @property {boolean}  indexed         - Whether the current repo has a .gitnexus index
 * @property {boolean}  stale           - Whether the index is behind HEAD
 * @property {number}   commitsBehind   - How many commits behind HEAD
 * @property {boolean}  mcpRegistered   - Whether GitNexus is registered in MCP config
 * @property {boolean}  mcpConnected    - Whether the MCP server is currently connected
 */

class GitNexusService extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {Object} [opts.logger]           - Pino-compatible logger
   * @param {Object} [opts.mcpClientManager] - CodeIn MCP client manager (nullable)
   */
  constructor(opts = {}) {
    super();
    this._logger = opts.logger || console;
    this._mcpClientManager = opts.mcpClientManager || null;
    this._installedVersion = null;
    this._installChecked = false;
  }

  // ─── Installation Detection ───────────────────────────────────────

  /**
   * Check if gitnexus CLI is available on the system.
   * Caches result after first successful check.
   * @returns {Promise<{installed: boolean, version: string|null}>}
   */
  async checkInstalled() {
    if (this._installChecked && this._installedVersion) {
      return { installed: true, version: this._installedVersion };
    }

    try {
      const { stdout } = await execFileAsync(
        "npx",
        ["-y", "gitnexus@latest", "--version"],
        {
          timeout: 30000,
          env: { ...process.env, npm_config_yes: "true" },
        },
      );
      const version = stdout.trim();
      this._installedVersion = version;
      this._installChecked = true;
      return { installed: true, version };
    } catch {
      this._installChecked = true;
      this._installedVersion = null;
      return { installed: false, version: null };
    }
  }

  // ─── Index Status ─────────────────────────────────────────────────

  /**
   * Check whether a repo has a GitNexus index and its staleness.
   * @param {string} repoPath - Absolute path to the repository root
   * @returns {Promise<{indexed: boolean, stale: boolean, commitsBehind: number}>}
   */
  async checkIndex(repoPath) {
    const indexPath = path.join(repoPath, GITNEXUS_INDEX_DIR);

    if (!fs.existsSync(indexPath)) {
      return { indexed: false, stale: false, commitsBehind: 0 };
    }

    // Read stored last commit from the index metadata
    const metaPath = path.join(indexPath, "meta.json");
    let lastCommit = null;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      lastCommit = meta.lastCommit || meta.commit || null;
    } catch {
      // If meta.json missing or unreadable, still indexed but can't check staleness
      return { indexed: true, stale: false, commitsBehind: 0 };
    }

    if (!lastCommit) {
      return { indexed: true, stale: false, commitsBehind: 0 };
    }

    // Check how many commits behind HEAD
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-list", "--count", `${lastCommit}..HEAD`],
        { cwd: repoPath, timeout: 10000 },
      );
      const commitsBehind = parseInt(stdout.trim(), 10) || 0;
      return {
        indexed: true,
        stale: commitsBehind > 0,
        commitsBehind,
      };
    } catch {
      // Git command failed — assume not stale (fail-open)
      return { indexed: true, stale: false, commitsBehind: 0 };
    }
  }

  // ─── Indexing ─────────────────────────────────────────────────────

  /**
   * Index a repository with GitNexus.
   * Spawns `npx gitnexus analyze <repoPath>` as a child process.
   *
   * @param {string} repoPath - Absolute path to the repository root
   * @param {Object} [opts]
   * @param {AbortSignal} [opts.signal] - Abort signal to cancel indexing
   * @returns {Promise<{success: boolean, error?: string, duration?: number}>}
   */
  async indexRepo(repoPath, opts = {}) {
    const { installed } = await this.checkInstalled();
    if (!installed) {
      return { success: false, error: "gitnexus is not installed" };
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      const child = spawn(
        "npx",
        ["-y", "gitnexus@latest", "analyze", repoPath],
        {
          env: { ...process.env, npm_config_yes: "true" },
          stdio: ["ignore", "pipe", "pipe"],
          signal: opts.signal,
        },
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        const duration = Date.now() - startTime;
        if (code === 0) {
          this._logger.info(
            { repoPath, duration },
            "GitNexus indexing completed",
          );
          this.emit("indexed", { repoPath, duration });
          resolve({ success: true, duration });
        } else {
          const error = stderr.trim() || `Process exited with code ${code}`;
          this._logger.warn(
            { repoPath, code, error },
            "GitNexus indexing failed",
          );
          resolve({ success: false, error });
        }
      });

      child.on("error", (err) => {
        this._logger.warn(
          { repoPath, error: err.message },
          "GitNexus spawn error",
        );
        resolve({ success: false, error: err.message });
      });
    });
  }

  // ─── MCP Registration ────────────────────────────────────────────

  /**
   * Register GitNexus as an MCP server in CodeIn's MCP client manager.
   * No-op if already registered or if MCP client manager is unavailable.
   *
   * @returns {Promise<{registered: boolean, alreadyRegistered?: boolean, error?: string}>}
   */
  async registerMcpServer() {
    if (!this._mcpClientManager) {
      return { registered: false, error: "MCP client manager not available" };
    }

    // Check if already registered
    try {
      const config = this._mcpClientManager.loadServersConfig();
      if (config.servers && config.servers[GITNEXUS_SERVER_NAME]) {
        return { registered: true, alreadyRegistered: true };
      }
    } catch {
      // Config read failed, try to register anyway
    }

    try {
      await this._mcpClientManager.addServer(
        GITNEXUS_SERVER_NAME,
        GITNEXUS_MCP_CONFIG,
      );
      this._logger.info("GitNexus registered as MCP server");
      return { registered: true };
    } catch (err) {
      return { registered: false, error: err.message };
    }
  }

  /**
   * Check MCP connection status for GitNexus.
   * @returns {{registered: boolean, connected: boolean}}
   */
  getMcpStatus() {
    if (!this._mcpClientManager) {
      return { registered: false, connected: false };
    }

    try {
      const config = this._mcpClientManager.loadServersConfig();
      const registered = !!(
        config.servers && config.servers[GITNEXUS_SERVER_NAME]
      );
      const server = this._mcpClientManager.servers?.get(GITNEXUS_SERVER_NAME);
      const connected = server?.status === "connected";
      return { registered, connected };
    } catch {
      return { registered: false, connected: false };
    }
  }

  // ─── Composite Status ────────────────────────────────────────────

  /**
   * Get full status of GitNexus integration for a given repo.
   * @param {string} repoPath - Absolute path to the repository root
   * @returns {Promise<GitNexusStatus>}
   */
  async getStatus(repoPath) {
    const [installInfo, indexInfo, mcpStatus] = await Promise.all([
      this.checkInstalled(),
      this.checkIndex(repoPath),
      Promise.resolve(this.getMcpStatus()),
    ]);

    return {
      installed: installInfo.installed,
      version: installInfo.version,
      indexed: indexInfo.indexed,
      stale: indexInfo.stale,
      commitsBehind: indexInfo.commitsBehind,
      mcpRegistered: mcpStatus.registered,
      mcpConnected: mcpStatus.connected,
      stalenessThreshold: STALENESS_THRESHOLD,
      needsReindex:
        indexInfo.stale && indexInfo.commitsBehind >= STALENESS_THRESHOLD,
    };
  }

  /**
   * Full setup flow: check install → index if needed → register MCP.
   * @param {string} repoPath
   * @returns {Promise<{success: boolean, status: GitNexusStatus, error?: string}>}
   */
  async setup(repoPath) {
    const { installed } = await this.checkInstalled();
    if (!installed) {
      return {
        success: false,
        status: await this.getStatus(repoPath),
        error:
          "gitnexus is not installed. Install with: npm install -g gitnexus",
      };
    }

    // Index if not already indexed
    const { indexed } = await this.checkIndex(repoPath);
    if (!indexed) {
      const result = await this.indexRepo(repoPath);
      if (!result.success) {
        return {
          success: false,
          status: await this.getStatus(repoPath),
          error: `Indexing failed: ${result.error}`,
        };
      }
    }

    // Register MCP server
    await this.registerMcpServer();

    return {
      success: true,
      status: await this.getStatus(repoPath),
    };
  }
}

// Singleton-ish factory — subsystem loader creates one instance
let _instance = null;

/**
 * Create or return the GitNexus service instance.
 * @param {Object} [opts]
 * @returns {GitNexusService}
 */
function createGitNexusService(opts = {}) {
  if (!_instance) {
    _instance = new GitNexusService(opts);
  }
  return _instance;
}

module.exports = {
  GitNexusService,
  createGitNexusService,
  GITNEXUS_SERVER_NAME,
};
