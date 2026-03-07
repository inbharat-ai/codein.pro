"use strict";

const { RunpodBYOProvider } = require("../gpu-orchestration/runpod-provider");
const { Keyring } = require("../security/keyring");

class GpuSessionManager {
  constructor(options = {}) {
    this.keyring = options.keyring || new Keyring();
    this.providerFactory =
      options.providerFactory || ((config) => new RunpodBYOProvider(config));
    this.sessions = new Map(); // userId -> { provider, jobs }
  }

  _secretKey(userId) {
    return `runpod_api_key:${userId}`;
  }

  _getSession(userId) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        provider: null,
        jobs: new Map(), // jobId -> { submittedAt, payload }
      });
    }
    return this.sessions.get(userId);
  }

  setApiKey(userId, apiKey) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("Runpod API key is required");
    }
    this.keyring.set(this._secretKey(userId), apiKey);
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
  }
}

module.exports = {
  GpuSessionManager,
};
