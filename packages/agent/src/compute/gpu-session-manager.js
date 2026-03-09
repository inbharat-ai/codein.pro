"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { RunpodBYOProvider } = require("../gpu-orchestration/runpod-provider");
const { Keyring } = require("../security/keyring");
const { getDataDir } = require("../store");

class GpuSessionManager {
  constructor(options = {}) {
    this.keyring = options.keyring || new Keyring();
    this.providerFactory =
      options.providerFactory || ((config) => new RunpodBYOProvider(config));
    this.stateFile =
      options.stateFile ||
      path.join(getDataDir(), "compute", "gpu-sessions.json");
    this.sessions = new Map(); // userId -> { provider, jobs }
    this._ensureStateDir();
    this._loadState();
  }

  _ensureStateDir() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
  }

  _saveState() {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      sessions: Array.from(this.sessions.entries()).map(
        ([userId, session]) => ({
          userId,
          connected: !!session.provider,
          config: session.config || null,
          jobs: Array.from(session.jobs.entries()),
        }),
      ),
    };
    const tmp = `${this.stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmp, this.stateFile);
  }

  _loadState() {
    if (!fs.existsSync(this.stateFile)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      if (!Array.isArray(parsed.sessions)) return;
      for (const item of parsed.sessions) {
        if (!item?.userId) continue;
        this.sessions.set(item.userId, {
          provider: null,
          config: item.config || null,
          jobs: new Map(Array.isArray(item.jobs) ? item.jobs : []),
        });
      }
    } catch {
      // Ignore corrupted state and continue
    }
  }

  _secretKey(userId) {
    return `runpod_api_key:${userId}`;
  }

  _getSession(userId) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        provider: null,
        config: null,
        jobs: new Map(), // jobId -> { submittedAt, payload }
      });
      this._saveState();
    }
    return this.sessions.get(userId);
  }

  setApiKey(userId, apiKey) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("Runpod API key is required");
    }
    this.keyring.set(this._secretKey(userId), apiKey);
    this._saveState();
    return { saved: true };
  }

  getApiKey(userId) {
    return this.keyring.get(this._secretKey(userId));
  }

  async connect(userId, config = {}) {
    const session = this._getSession(userId);

    const apiKey = config.apiKey || this.getApiKey(userId);
    if (!apiKey) {
      throw new Error("Runpod API key is not configured for this user");
    }

    if (config.apiKey) {
      this.setApiKey(userId, config.apiKey);
    }

    // Replace previous provider if present
    if (session.provider) {
      try {
        await session.provider.stopPod();
      } catch {
        // Ignore stop errors while rotating provider
      }
      session.provider.destroy();
    }

    session.provider = this.providerFactory({
      apiKey,
      maxBudgetUsd: config.maxBudgetUsd || 100,
      ttlMinutes: config.ttlMinutes || 30,
      idleShutdownMinutes: config.idleShutdownMinutes || 10,
    });
    session.config = {
      maxBudgetUsd: config.maxBudgetUsd || 100,
      ttlMinutes: config.ttlMinutes || 30,
      idleShutdownMinutes: config.idleShutdownMinutes || 10,
    };
    this._saveState();

    return { connected: true, userId };
  }

  async listGpuTypes(userId) {
    const session = this._getSession(userId);
    if (!session.provider) {
      await this.connect(userId);
    }
    return session.provider.listGpuTypes();
  }

  async createPod(userId, podConfig) {
    const session = this._getSession(userId);
    if (!session.provider) {
      await this.connect(userId);
    }
    return session.provider.createPod(podConfig);
  }

  async submitJob(userId, jobConfig) {
    const session = this._getSession(userId);
    if (!session.provider) {
      throw new Error(
        "GPU session not connected. Call /compute/gpu/connect first",
      );
    }

    const result = await session.provider.submitJob(jobConfig);
    session.jobs.set(result.jobId, {
      submittedAt: new Date().toISOString(),
      payload: {
        jobName: jobConfig.jobName || null,
      },
    });
    this._saveState();

    return result;
  }

  async getJobStatus(userId, jobId) {
    const session = this._getSession(userId);
    if (!session.provider) {
      throw new Error("GPU session not connected");
    }
    return session.provider.getJobStatus(jobId);
  }

  async getLogs(userId) {
    const session = this._getSession(userId);
    if (!session.provider) {
      throw new Error("GPU session not connected");
    }
    return session.provider.getPodLogs();
  }

  getStatus(userId) {
    const session = this._getSession(userId);
    if (!session.provider) {
      return {
        connected: false,
        status: "idle",
        jobsRunning: 0,
        reconnectRequired: !!session.config,
      };
    }

    const info = session.provider.getSessionInfo();
    return {
      connected: true,
      provider: "runpod",
      status: info.status,
      podId: info.podId,
      budget: info.costAccumulated + info.budgetRemaining,
      spent: info.costAccumulated,
      remaining: info.budgetRemaining,
      sessionTtl: info.ttlMinutes * 60 * 1000,
      idleTimeout: info.idleShutdownMinutes * 60 * 1000,
      jobsRunning: Array.from(session.jobs.keys()).length,
      createdAt: info.createdAt,
      lastActivityAt: info.lastActivityAt,
    };
  }

  async stop(userId) {
    const session = this._getSession(userId);
    if (!session.provider) {
      return { stopped: true, costFinal: 0 };
    }

    const result = await session.provider.stopPod();
    session.provider.destroy();
    session.provider = null;
    session.jobs.clear();
    session.config = null;
    this._saveState();

    return {
      stopped: true,
      ...result,
    };
  }

  async shutdownAll() {
    const userIds = Array.from(this.sessions.keys());
    for (const userId of userIds) {
      try {
        await this.stop(userId);
      } catch {
        // Ignore on shutdown
      }
    }
    this._saveState();
  }
}

module.exports = {
  GpuSessionManager,
};
