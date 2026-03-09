/**
 * RunPod BYO Provider — Real Implementation
 *
 * Uses RunPod's actual API:
 *   • GraphQL  → https://api.runpod.io/graphql   (pod CRUD, GPU listing)
 *   • REST     → https://api.runpod.io/v2/{id}/run  (serverless jobs)
 *
 * Lifecycle:
 *   1. User provides RunPod API key
 *   2. List available GPU types via GraphQL
 *   3. Create on-demand pod or use serverless endpoint
 *   4. Submit jobs, poll status
 *   5. Auto-stop after TTL / idle timeout
 *   6. Budget enforcement
 *
 * Reference: https://docs.runpod.io/
 */

"use strict";

const https = require("https");
const { EventEmitter } = require("events");

// ─── GraphQL Queries ────────────────────────────────────────

const GQL_GPU_TYPES = `
  query GpuTypes {
    gpuTypes {
      id
      displayName
      memoryInGb
      secureCloud
      communityCloud
      lowestPrice(gpuCount: 1, input: { cloudType: ALL }) {
        minimumBidPrice
        uninterruptablePrice
      }
    }
  }
`;

const GQL_CREATE_POD = `
  mutation CreatePod($input: PodFindAndDeployOnDemandInput!) {
    podFindAndDeployOnDemand(input: $input) {
      id
      name
      desiredStatus
      imageName
      machineId
      machine {
        podHostId
      }
    }
  }
`;

const GQL_STOP_POD = `
  mutation StopPod($podId: String!) {
    podStop(input: { podId: $podId }) {
      id
      desiredStatus
    }
  }
`;

const GQL_TERMINATE_POD = `
  mutation TerminatePod($podId: String!) {
    podTerminate(input: { podId: $podId })
  }
`;

const GQL_GET_POD = `
  query GetPod($podId: String!) {
    pod(input: { podId: $podId }) {
      id
      name
      desiredStatus
      runtime {
        uptimeInSeconds
        gpus {
          id
          gpuUtilPercent
          memoryUtilPercent
        }
        ports {
          ip
          isIpPublic
          privatePort
          publicPort
          type
        }
      }
      costPerHr
      gpuCount
      vcpuCount
      memoryInGb
    }
  }
`;

const GQL_LIST_PODS = `
  query ListPods {
    myself {
      pods {
        id
        name
        desiredStatus
        costPerHr
        runtime {
          uptimeInSeconds
        }
        gpuCount
        machine {
          gpuDisplayName
        }
      }
    }
  }
`;

// ─── Provider Class ─────────────────────────────────────────

class RunpodBYOProvider extends EventEmitter {
  /**
   * @param {object} config
   * @param {string} config.apiKey        - RunPod API key
   * @param {number} [config.maxBudgetUsd=100]
   * @param {number} [config.ttlMinutes=30]
   * @param {number} [config.idleShutdownMinutes=10]
   */
  constructor(config = {}) {
    super();

    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      throw new Error("RunPod API key is required");
    }

    this.maxBudgetUsd = config.maxBudgetUsd || 100;
    this.ttlMinutes = config.ttlMinutes || 30;
    this.idleShutdownMinutes = config.idleShutdownMinutes || 10;

    // Session state
    this.podId = null;
    this.status = "idle"; // idle | provisioning | running | stopping | stopped
    this.createdAt = null;
    this.costAccumulated = 0;
    this.costPerHour = 0;
    this.lastActivityAt = null;

    // Serverless endpoint tracking
    this.serverlessEndpointId = null;

    // Timers
    this.idleShutdownTimer = null;
    this.ttlTimer = null;
    this.costTicker = null;
  }

  // ─── GPU Types ──────────────────────────────────────────

  /**
   * List available GPU types with pricing from RunPod
   * @returns {Promise<Array<{id:string, name:string, vramGb:number, pricePerHr:number}>>}
   */
  async listGpuTypes() {
    const data = await this._graphql(GQL_GPU_TYPES);
    const gpus = data.gpuTypes || [];

    return gpus
      .filter((g) => g.lowestPrice && g.lowestPrice.uninterruptablePrice > 0)
      .map((g) => ({
        id: g.id,
        name: g.displayName,
        vramGb: g.memoryInGb,
        pricePerHr: g.lowestPrice.uninterruptablePrice,
        spotPrice: g.lowestPrice.minimumBidPrice,
        secureCloud: g.secureCloud,
        communityCloud: g.communityCloud,
      }))
      .sort((a, b) => a.pricePerHr - b.pricePerHr);
  }

  // ─── Pod Management (On-Demand) ─────────────────────────

  /**
   * Create an on-demand GPU pod via RunPod GraphQL
   * @param {object} opts
   * @param {string} opts.gpuTypeId       - GPU type ID from listGpuTypes()
   * @param {string} opts.name            - Pod name
   * @param {string} opts.imageName       - Docker image
   * @param {number} [opts.gpuCount=1]
   * @param {number} [opts.volumeInGb=0]
   * @param {number} [opts.containerDiskInGb=20]
   * @param {string} [opts.cloudType="ALL"]  - SECURE | COMMUNITY | ALL
   * @param {string[]} [opts.ports]          - e.g. ["8888/http", "22/tcp"]
   */
  async createPod(opts) {
    if (this.status !== "idle") {
      throw new Error(
        `Cannot create pod while ${this.status}. Stop existing pod first.`,
      );
    }

    const {
      gpuTypeId,
      name,
      imageName,
      gpuCount = 1,
      volumeInGb = 0,
      containerDiskInGb = 20,
      cloudType = "ALL",
      ports,
    } = opts;

    if (!gpuTypeId || !imageName) {
      throw new Error("gpuTypeId and imageName are required");
    }

    this.status = "provisioning";
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();

    try {
      const input = {
        name: name || `codein-${Date.now()}`,
        imageName,
        gpuTypeId,
        gpuCount,
        volumeInGb,
        containerDiskInGb,
        cloudType,
        startJupyter: false,
        startSsh: true,
        dockerArgs: "",
      };

      if (ports) {
        input.ports = ports.join(",");
      }

      const data = await this._graphql(GQL_CREATE_POD, { input });
      const pod = data.podFindAndDeployOnDemand;

      if (!pod || !pod.id) {
        throw new Error("Pod creation failed — no pod ID returned");
      }

      this.podId = pod.id;
      this.status = "running";

      // Fetch cost info
      const podInfo = await this.getPodInfo();
      this.costPerHour = podInfo.costPerHr || 0;

      this._startTimers();

      this.emit("pod_created", {
        podId: this.podId,
        name: pod.name,
        costPerHour: this.costPerHour,
      });

      return {
        podId: this.podId,
        name: pod.name,
        costPerHour: this.costPerHour,
        desiredStatus: pod.desiredStatus,
      };
    } catch (err) {
      this.status = "idle";
      throw err;
    }
  }

  /**
   * Get pod details via GraphQL
   */
  async getPodInfo() {
    if (!this.podId) throw new Error("No active pod");
    const data = await this._graphql(GQL_GET_POD, { podId: this.podId });
    return data.pod;
  }

  /**
   * List all user's pods
   */
  async listPods() {
    const data = await this._graphql(GQL_LIST_PODS);
    return data.myself?.pods || [];
  }

  /**
   * Stop pod (keeps volume, can resume)
   */
  async stopPod() {
    if (!this.podId || this.status === "stopped") {
      return { costFinal: this.costAccumulated };
    }

    this.status = "stopping";
    this._clearTimers();

    try {
      await this._graphql(GQL_STOP_POD, { podId: this.podId });
      this._finalizeCost();
      this.status = "stopped";

      this.emit("pod_stopped", {
        podId: this.podId,
        costFinal: this.costAccumulated,
      });

      return { costFinal: this.costAccumulated };
    } catch (err) {
      this.status = "idle";
      throw err;
    }
  }

  /**
   * Terminate pod completely (destroys volume)
   */
  async terminatePod() {
    if (!this.podId) return { costFinal: this.costAccumulated };

    this._clearTimers();

    try {
      await this._graphql(GQL_TERMINATE_POD, { podId: this.podId });
      this._finalizeCost();
      this.status = "stopped";
      this.podId = null;

      this.emit("pod_terminated", { costFinal: this.costAccumulated });
      return { costFinal: this.costAccumulated };
    } catch (err) {
      this.status = "idle";
      throw err;
    }
  }

  // ─── Serverless Endpoints ───────────────────────────────

  /**
   * Submit an async job to a RunPod serverless endpoint
   * @param {string} endpointId - RunPod serverless endpoint ID
   * @param {object} input      - Job input payload
   * @returns {Promise<{id:string, status:string}>}
   */
  async runServerless(endpointId, input) {
    this._resetIdleTimer();
    this.lastActivityAt = Date.now();

    const result = await this._rest("POST", `/v2/${endpointId}/run`, { input });

    this.emit("job_submitted", {
      endpointId,
      jobId: result.id,
      status: result.status,
    });

    return { id: result.id, status: result.status };
  }

  /**
   * Submit a synchronous job (blocks until complete, 30s timeout on RunPod)
   */
  async runServerlessSync(endpointId, input) {
    this._resetIdleTimer();
    this.lastActivityAt = Date.now();

    return this._rest("POST", `/v2/${endpointId}/runsync`, { input });
  }

  /**
   * Get serverless job status
   */
  async getServerlessJobStatus(endpointId, jobId) {
    return this._rest("POST", `/v2/${endpointId}/status/${jobId}`, null);
  }

  /**
   * Cancel a serverless job
   */
  async cancelServerlessJob(endpointId, jobId) {
    return this._rest("POST", `/v2/${endpointId}/cancel/${jobId}`, null);
  }

  // ─── Budget & Session ───────────────────────────────────

  isBudgetExceeded() {
    return this.costAccumulated >= this.maxBudgetUsd;
  }

  getSessionInfo() {
    return {
      podId: this.podId,
      status: this.status,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      costAccumulated: Math.round(this.costAccumulated * 100) / 100,
      costPerHour: this.costPerHour,
      budgetRemaining: Math.max(
        0,
        Math.round((this.maxBudgetUsd - this.costAccumulated) * 100) / 100,
      ),
      isBudgetExceeded: this.isBudgetExceeded(),
      ttlMinutes: this.ttlMinutes,
      idleShutdownMinutes: this.idleShutdownMinutes,
      serverlessEndpointId: this.serverlessEndpointId,
    };
  }

  // ─── Private: GraphQL ───────────────────────────────────

  async _graphql(query, variables = {}) {
    const body = JSON.stringify({ query, variables });

    const result = await this._withRetry(() =>
      this._httpsRequest({
        hostname: "api.runpod.io",
        path: "/graphql",
        method: "POST",
        body,
      }),
    );

    if (result.errors && result.errors.length > 0) {
      const msg = result.errors.map((e) => e.message).join("; ");
      throw new Error(`RunPod GraphQL error: ${msg}`);
    }

    return result.data;
  }

  // ─── Private: REST (Serverless) ─────────────────────────

  async _rest(method, path, body) {
    return this._withRetry(() =>
      this._httpsRequest({
        hostname: "api.runpod.io",
        path,
        method,
        body: body ? JSON.stringify(body) : null,
      }),
    );
  }

  // ─── Private: HTTPS ─────────────────────────────────────

  _httpsRequest({ hostname, path, method, body }) {
    return new Promise((resolve, reject) => {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      };

      if (body) {
        headers["Content-Length"] = Buffer.byteLength(body);
      }

      const req = https.request(
        { hostname, port: 443, path, method, headers },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
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
                  `RunPod API ${res.statusCode}: ${data.slice(0, 300)}`,
                ),
              );
            }
          });
        },
      );

      req.on("error", reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error("RunPod API request timed out (30s)"));
      });

      if (body) req.write(body);
      req.end();
    });
  }

  // ─── Private: Retry ─────────────────────────────────────

  async _withRetry(operation, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || err);
        const transient =
          /timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|429|50[0-9]/i.test(msg);
        if (!transient || attempt === maxRetries) throw err;
        await new Promise((r) =>
          setTimeout(r, Math.min(300 * 2 ** attempt, 5000)),
        );
      }
    }
    throw lastError;
  }

  // ─── Private: Timers ────────────────────────────────────

  _startTimers() {
    // Cost ticker: accumulate cost every minute
    this.costTicker = setInterval(() => {
      if (this.status === "running" && this.costPerHour > 0) {
        this.costAccumulated += this.costPerHour / 60;
        if (this.isBudgetExceeded()) {
          this.emit("budget_exceeded", {
            spent: this.costAccumulated,
            budget: this.maxBudgetUsd,
          });
          this.stopPod().catch((e) =>
            console.error("Budget auto-stop error:", e),
          );
        }
      }
    }, 60_000);

    // TTL timer
    this.ttlTimer = setTimeout(() => {
      this.emit("ttl_expired", { ttlMinutes: this.ttlMinutes });
      this.stopPod().catch((e) => console.error("TTL auto-stop error:", e));
    }, this.ttlMinutes * 60_000);

    this._resetIdleTimer();
  }

  _resetIdleTimer() {
    if (this.idleShutdownTimer) clearTimeout(this.idleShutdownTimer);
    this.idleShutdownTimer = setTimeout(() => {
      this.emit("idle_shutdown", {
        idleMinutes: this.idleShutdownMinutes,
      });
      this.stopPod().catch((e) => console.error("Idle auto-stop error:", e));
    }, this.idleShutdownMinutes * 60_000);
  }

  _finalizeCost() {
    if (this.createdAt && this.costPerHour > 0) {
      const hours = (Date.now() - this.createdAt) / 3_600_000;
      this.costAccumulated = Math.round(hours * this.costPerHour * 100) / 100;
    }
  }

  _clearTimers() {
    if (this.ttlTimer) clearTimeout(this.ttlTimer);
    if (this.idleShutdownTimer) clearTimeout(this.idleShutdownTimer);
    if (this.costTicker) clearInterval(this.costTicker);
    this.ttlTimer = null;
    this.idleShutdownTimer = null;
    this.costTicker = null;
  }

  destroy() {
    this._clearTimers();
    if (this.status === "running") {
      this.stopPod().catch((e) => console.error("Cleanup error:", e));
    }
  }
}

module.exports = { RunpodBYOProvider };
