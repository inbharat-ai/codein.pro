/**
 * Runpod BYO Provider Implementation
 *
 * Provides real GPU compute via Runpod's "bring your own" endpoint system.
 * Lifecycle:
 * 1. User provides Runpod API key (stored securely)
 * 2. List available GPU types with pricing
 * 3. Create session (pod) on demand
 * 4. Submit compute job to pod
 * 5. Poll for completion
 * 6. Stop pod (auto-stop after TTL)
 * 7. Retrieve logs and results
 *
 * Reference: https://docs.runpod.io/serverless/endpoints/about
 */

"use strict";

const https = require("https");
const { EventEmitter } = require("events");

/**
 * Runpod BYO Provider Instance
 *
 * Manages lifecycle of GPU compute for one user session
 */
class RunpodBYOProvider extends EventEmitter {
  /**
   * @param {object} config
   * @param {string} config.apiKey - Runpod API key (from user)
   * @param {number} [config.maxBudgetUsd=100] - $ cap per session
   * @param {number} [config.ttlMinutes=30] - Auto-stop after N minutes
   * @param {number} [config.idleShutdownMinutes=10] - Stop if idle for N minutes
   */
  constructor(config = {}) {
    super();

    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      throw new Error("Runpod API key is required");
    }

    this.maxBudgetUsd = config.maxBudgetUsd || 100;
    this.ttlMinutes = config.ttlMinutes || 30;
    this.idleShutdownMinutes = config.idleShutdownMinutes || 10;

    // Session state
    this.podId = null;
    this.status = "idle"; // idle, provisioning, running, stopping, stopped
    this.createdAt = null;
    this.costAccumulated = 0;
    this.lastActivityAt = null;

    // Timers
    this.idleShutdownTimer = null;
    this.ttlTimer = null;
  }

  /**
   * List available GPU types with pricing
   * @returns {Promise<Array>}
   */
  async listGpuTypes() {
    const response = await this._apiCall("GET", "/gpus", null);

    // Filter to reasonable options: V100, A100, RTX 4090, L40, etc.
    const reasonable = response.gpus.filter((gpu) => {
      const name = gpu.name.toLowerCase();
      return (
        name.includes("v100") ||
        name.includes("a100") ||
        name.includes("rtx 4090") ||
        name.includes("l40") ||
        name.includes("h100")
      );
    });

    return reasonable.map((gpu) => ({
      name: gpu.name,
      vram: gpu.vram,
      costPerHour: gpu.costPerHour,
      availability: gpu.available,
    }));
  }

  /**
   * Create a pod (GPU instance)
   * @param {object} config
   * @param {string} config.gpuName - GPU type (e.g. "NVIDIA RTX A40")
   * @param {string} config.containerImage - Docker image URI
   * @param {string} [config.volume] - Persistent volume mount
   * @param {number} [config.timeoutMinutes=60] - Job timeout
   * @returns {Promise<{ podId: string, endpoint: string, costPerHour: number }>}
   */
  async createPod(config) {
    if (this.status !== "idle") {
      throw new Error(
        `Cannot create pod while ${this.status}. Call stopPod first.`,
      );
    }

    const { gpuName, containerImage, volume, timeoutMinutes } = config;

    if (!gpuName || !containerImage) {
      throw new Error("gpuName and containerImage are required");
    }

    this.status = "provisioning";
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();

    try {
      const response = await this._apiCall("POST", "/pods", {
        cloudType: "community",
        gpuCount: 1,
        gpuTypeId: gpuName, // Runpod maps by name or ID
        containerImage,
        volumeInGb: volume ? 10 : 0,
        timeout: timeoutMinutes || 60,
      });

      this.podId = response.id;
      this.status = "running";

      // Start TTL shutdown timer
      this._startTTLTimer();

      // Start idle shutdown timer
      this._startIdleShutdownTimer();

      this.emit("pod_created", {
        podId: this.podId,
        endpoint: response.endpoint,
        costPerHour: response.costPerHour,
      });

      return {
        podId: this.podId,
        endpoint: response.endpoint,
        costPerHour: response.costPerHour,
      };
    } catch (err) {
      this.status = "idle";
      throw err;
    }
  }

  /**
   * Submit job to running pod
   * @param {object} jobConfig
   * @param {string} jobConfig.input - Input JSON (or serialized data)
   * @param {string} [jobConfig.jobName] - Optional job name for tracking
   * @returns {Promise<{ jobId: string, status: string }>}
   */
  async submitJob(jobConfig) {
    if (this.status !== "running") {
      throw new Error(
        `Cannot submit job while pod is ${this.status}. Create pod first.`,
      );
    }

    if (!this.podId) {
      throw new Error("No active pod");
    }

    const { input, jobName } = jobConfig;

    // Reset idle timer on activity
    this._resetIdleTimer();

    try {
      // Call pod endpoint with input
      const jobResponse = await this._callPodEndpoint(this.podId, input);

      this.lastActivityAt = Date.now();

      this.emit("job_submitted", {
        podId: this.podId,
        jobId: jobResponse.jobId,
        jobName: jobName || "unnamed",
      });

      return {
        jobId: jobResponse.jobId,
        status: "submitted",
      };
    } catch (err) {
      this.emit("job_error", { error: err.message });
      throw err;
    }
  }

  /**
   * Poll job status
   * @param {string} jobId
   * @returns {Promise<{ status: string, result?: any, logs?: string }>}
   */
  async getJobStatus(jobId) {
    if (!this.podId) {
      throw new Error("No active pod");
    }

    try {
      const response = await this._apiCall(
        "GET",
        `/pods/${this.podId}/jobs/${jobId}`,
        null,
      );

      return {
        status: response.status, // submitted, running, completed, failed
        result: response.result,
        logs: response.logs,
        costSoFar: response.estimatedCost || 0,
      };
    } catch (err) {
      this.emit("job_status_error", { jobId, error: err.message });
      throw err;
    }
  }

  /**
   * Get pod logs
   * @returns {Promise<string>}
   */
  async getPodLogs() {
    if (!this.podId) {
      throw new Error("No active pod");
    }

    const response = await this._apiCall(
      "GET",
      `/pods/${this.podId}/logs`,
      null,
    );
    return response.logs || "";
  }

  /**
   * Stop pod and cleanup
   * @returns {Promise<{ costFinal: number, logsUrl?: string }>}
   */
  async stopPod() {
    if (!this.podId || this.status === "stopped") {
      return { costFinal: this.costAccumulated };
    }

    this.status = "stopping";
    this._clearTimers();

    try {
      const response = await this._apiCall(
        "DELETE",
        `/pods/${this.podId}`,
        null,
      );

      this.costAccumulated = response.totalCost || 0;
      this.status = "stopped";

      this.emit("pod_stopped", {
        podId: this.podId,
        costFinal: this.costAccumulated,
      });

      return {
        costFinal: this.costAccumulated,
        logsUrl: response.logsDownloadUrl,
      };
    } catch (err) {
      console.error("Error stopping pod", err);
      this.status = "idle";
      throw err;
    }
  }

  /**
   * Check if budget is exceeded
   */
  isBudgetExceeded() {
    return this.costAccumulated >= this.maxBudgetUsd;
  }

  /**
   * Get current session info
   */
  getSessionInfo() {
    return {
      podId: this.podId,
      status: this.status,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      costAccumulated: this.costAccumulated,
      budgetRemaining: Math.max(0, this.maxBudgetUsd - this.costAccumulated),
      isBudgetExceeded: this.isBudgetExceeded(),
      ttlMinutes: this.ttlMinutes,
      idleShutdownMinutes: this.idleShutdownMinutes,
    };
  }

  // ─── Private Methods ───────────────────────────────────────

  /**
   * Runpod API call helper
   * @private
   */
  async _apiCall(method, endpoint, body) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.runpod.io",
        port: 443,
        path: endpoint,
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          } else {
            reject(
              new Error(
                `Runpod API error ${res.statusCode}: ${data.slice(0, 200)}`,
              ),
            );
          }
        });
      });

      req.on("error", reject);

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Call pod endpoint with input
   * @private
   */
  async _callPodEndpoint(podId, input) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.runpod.io",
        port: 443,
        path: `/v1/submissions/${podId}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error("Invalid JSON response from pod endpoint"));
            }
          } else {
            reject(new Error(`Pod submission failed: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on("error", reject);
      req.write(typeof input === "string" ? input : JSON.stringify(input));
      req.end();
    });
  }

  /**
   * TTL shutdown timer
   * @private
   */
  _startTTLTimer() {
    if (this.ttlTimer) clearTimeout(this.ttlTimer);

    this.ttlTimer = setTimeout(
      () => {
        console.log(`Pod TTL expired (${this.ttlMinutes} min), stopping...`);
        this.stopPod().catch((err) => console.error("TTL shutdown error", err));
      },
      this.ttlMinutes * 60 * 1000,
    );
  }

  /**
   * Idle shutdown timer
   * @private
   */
  _startIdleShutdownTimer() {
    this._resetIdleTimer();
  }

  /**
   * Reset idle timer on activity
   * @private
   */
  _resetIdleTimer() {
    if (this.idleShutdownTimer) clearTimeout(this.idleShutdownTimer);

    this.idleShutdownTimer = setTimeout(
      () => {
        console.log(
          `Pod idle for ${this.idleShutdownMinutes} min, stopping...`,
        );
        this.stopPod().catch((err) =>
          console.error("Idle shutdown error", err),
        );
      },
      this.idleShutdownMinutes * 60 * 1000,
    );
  }

  /**
   * Clear all timers
   * @private
   */
  _clearTimers() {
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }
    if (this.idleShutdownTimer) {
      clearTimeout(this.idleShutdownTimer);
      this.idleShutdownTimer = null;
    }
  }

  /**
   * Cleanup on destruction
   */
  destroy() {
    this._clearTimers();
    if (this.status === "running") {
      this.stopPod().catch((err) => console.error("Cleanup error", err));
    }
  }
}

module.exports = { RunpodBYOProvider };
