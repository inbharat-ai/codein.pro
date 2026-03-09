/**
 * RunPod MCP Server
 *
 * Exposes RunPod GPU management as MCP tools so the AI agent can
 * help users configure, launch, and manage GPU pods on demand.
 *
 * Protocol: JSON-RPC 2.0 over stdio (MCP standard)
 *
 * Tools exposed:
 *   runpod_connect       — Save/validate API key
 *   runpod_list_gpus     — List available GPU types + pricing
 *   runpod_list_pods     — Show user's active pods
 *   runpod_create_pod    — Provision an on-demand GPU pod
 *   runpod_stop_pod      — Stop a running pod (keeps volume)
 *   runpod_terminate_pod — Terminate pod + destroy volume
 *   runpod_pod_info      — Get pod details (utilization, ports)
 *   runpod_run_job       — Submit serverless inference job
 *   runpod_job_status    — Check serverless job status
 *   runpod_session_info  — Show current session cost/status
 */

"use strict";

const { RunpodBYOProvider } = require("../gpu-orchestration/runpod-provider");
const readline = require("readline");

// ─── Tool Definitions ───────────────────────────────────────

const TOOLS = [
  {
    name: "runpod_connect",
    description:
      "Connect to RunPod by providing your API key. Get your key from https://www.runpod.io/console/user/settings — Required before using any other RunPod tools.",
    inputSchema: {
      type: "object",
      properties: {
        apiKey: {
          type: "string",
          description: "RunPod API key (starts with rp_...)",
        },
        maxBudgetUsd: {
          type: "number",
          description:
            "Maximum budget in USD for this session (default: 100). Auto-stops pods when exceeded.",
        },
        ttlMinutes: {
          type: "number",
          description: "Auto-stop pods after this many minutes (default: 30).",
        },
        idleShutdownMinutes: {
          type: "number",
          description:
            "Auto-stop pods after this many idle minutes (default: 10).",
        },
      },
      required: ["apiKey"],
    },
  },
  {
    name: "runpod_list_gpus",
    description:
      "List all available GPU types on RunPod with pricing. Returns GPU name, VRAM, cost/hr, and availability. Use this to help users pick the right GPU for their workload.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "runpod_list_pods",
    description:
      "List all pods in the user's RunPod account (running, stopped, etc).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "runpod_create_pod",
    description:
      "Create an on-demand GPU pod on RunPod. Provisions a Docker container with GPU access. Use runpod_list_gpus first to find available GPU types.",
    inputSchema: {
      type: "object",
      properties: {
        gpuTypeId: {
          type: "string",
          description:
            'GPU type ID from runpod_list_gpus (e.g. "NVIDIA RTX A6000")',
        },
        imageName: {
          type: "string",
          description:
            'Docker image (e.g. "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04")',
        },
        name: {
          type: "string",
          description: "Pod name (optional, auto-generated if omitted)",
        },
        gpuCount: {
          type: "number",
          description: "Number of GPUs (default: 1)",
        },
        volumeInGb: {
          type: "number",
          description: "Persistent volume size in GB (default: 0 = no volume)",
        },
        containerDiskInGb: {
          type: "number",
          description: "Container disk size in GB (default: 20)",
        },
        cloudType: {
          type: "string",
          enum: ["ALL", "SECURE", "COMMUNITY"],
          description: "Cloud type preference (default: ALL)",
        },
        ports: {
          type: "array",
          items: { type: "string" },
          description: 'Ports to expose (e.g. ["8888/http", "22/tcp"])',
        },
      },
      required: ["gpuTypeId", "imageName"],
    },
  },
  {
    name: "runpod_stop_pod",
    description:
      "Stop the active pod. Keeps the volume intact so you can resume later. Use runpod_terminate_pod to destroy everything.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "runpod_terminate_pod",
    description:
      "Terminate the active pod and destroy its volume. This is irreversible — all data on the pod will be lost.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "runpod_pod_info",
    description:
      "Get detailed info about the active pod: GPU utilization, memory, ports, uptime, cost.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "runpod_run_job",
    description:
      "Submit an inference job to a RunPod serverless endpoint. Returns a job ID to track with runpod_job_status.",
    inputSchema: {
      type: "object",
      properties: {
        endpointId: {
          type: "string",
          description: "RunPod serverless endpoint ID",
        },
        input: {
          type: "object",
          description: "Job input payload (model-specific)",
        },
        sync: {
          type: "boolean",
          description:
            "If true, waits for result (up to 30s). If false, returns immediately with job ID.",
        },
      },
      required: ["endpointId", "input"],
    },
  },
  {
    name: "runpod_job_status",
    description:
      "Check the status and result of a serverless job submitted via runpod_run_job.",
    inputSchema: {
      type: "object",
      properties: {
        endpointId: {
          type: "string",
          description: "RunPod serverless endpoint ID",
        },
        jobId: {
          type: "string",
          description: "Job ID returned from runpod_run_job",
        },
      },
      required: ["endpointId", "jobId"],
    },
  },
  {
    name: "runpod_session_info",
    description:
      "Show current RunPod session info: active pod, cost accumulated, budget remaining, auto-stop timers.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ─── MCP Server ─────────────────────────────────────────────

class RunPodMCPServer {
  constructor() {
    this.provider = null; // Created on runpod_connect
    this.requestId = 0;
  }

  /**
   * Start the MCP server on stdio
   */
  start() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on("line", async (line) => {
      try {
        const request = JSON.parse(line);
        const response = await this._handleRequest(request);
        if (response) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch (err) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          }) + "\n",
        );
      }
    });

    rl.on("close", () => {
      if (this.provider) {
        this.provider.destroy();
      }
      process.exit(0);
    });
  }

  async _handleRequest(request) {
    const { id, method, params } = request;

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "runpod-gpu",
              version: "1.0.0",
            },
            capabilities: {
              tools: { listChanged: false },
            },
          },
        };

      case "notifications/initialized":
        return null; // No response for notifications

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS },
        };

      case "tools/call":
        return this._handleToolCall(id, params);

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  async _handleToolCall(id, params) {
    const { name, arguments: args } = params;

    try {
      const result = await this._executeTool(name, args || {});
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        },
      };
    }
  }

  async _executeTool(name, args) {
    // runpod_connect doesn't require existing provider
    if (name === "runpod_connect") {
      return this._toolConnect(args);
    }

    // All other tools require an active connection
    if (!this.provider) {
      throw new Error(
        "Not connected to RunPod. Use runpod_connect with your API key first.\n" +
          "Get your key at: https://www.runpod.io/console/user/settings",
      );
    }

    switch (name) {
      case "runpod_list_gpus":
        return this._toolListGpus();
      case "runpod_list_pods":
        return this._toolListPods();
      case "runpod_create_pod":
        return this._toolCreatePod(args);
      case "runpod_stop_pod":
        return this._toolStopPod();
      case "runpod_terminate_pod":
        return this._toolTerminatePod();
      case "runpod_pod_info":
        return this._toolPodInfo();
      case "runpod_run_job":
        return this._toolRunJob(args);
      case "runpod_job_status":
        return this._toolJobStatus(args);
      case "runpod_session_info":
        return this._toolSessionInfo();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ─── Tool Implementations ──────────────────────────────

  _toolConnect(args) {
    const { apiKey, maxBudgetUsd, ttlMinutes, idleShutdownMinutes } = args;

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      throw new Error(
        "Invalid API key. RunPod keys typically start with rp_ and are 20+ characters.",
      );
    }

    // Destroy old provider if reconnecting
    if (this.provider) {
      this.provider.destroy();
    }

    this.provider = new RunpodBYOProvider({
      apiKey: apiKey.trim(),
      maxBudgetUsd: maxBudgetUsd || 100,
      ttlMinutes: ttlMinutes || 30,
      idleShutdownMinutes: idleShutdownMinutes || 10,
    });

    return {
      status: "connected",
      message: "Connected to RunPod successfully",
      settings: {
        maxBudgetUsd: this.provider.maxBudgetUsd,
        ttlMinutes: this.provider.ttlMinutes,
        idleShutdownMinutes: this.provider.idleShutdownMinutes,
      },
      nextSteps: [
        "Use runpod_list_gpus to see available GPUs and pricing",
        "Use runpod_create_pod to launch a GPU instance",
        "Use runpod_run_job to submit serverless inference jobs",
      ],
    };
  }

  async _toolListGpus() {
    const gpus = await this.provider.listGpuTypes();

    if (gpus.length === 0) {
      return {
        message:
          "No GPUs currently available. This is unusual — try again in a moment.",
        gpus: [],
      };
    }

    // Format as a readable table
    const formatted = gpus.map((g) => ({
      id: g.id,
      name: g.name,
      vramGb: g.vramGb,
      pricePerHr: `$${g.pricePerHr.toFixed(2)}/hr`,
      spotPrice: g.spotPrice ? `$${g.spotPrice.toFixed(2)}/hr (spot)` : "N/A",
      secureCloud: g.secureCloud ? "Yes" : "No",
      communityCloud: g.communityCloud ? "Yes" : "No",
    }));

    return {
      message: `Found ${gpus.length} GPU types available on RunPod`,
      gpus: formatted,
      tip: "Use the 'id' field as gpuTypeId when creating a pod",
    };
  }

  async _toolListPods() {
    const pods = await this.provider.listPods();

    if (pods.length === 0) {
      return { message: "No pods found in your account.", pods: [] };
    }

    return {
      message: `Found ${pods.length} pod(s) in your account`,
      pods: pods.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.desiredStatus,
        gpu: p.machine?.gpuDisplayName || "unknown",
        gpuCount: p.gpuCount,
        costPerHr: p.costPerHr ? `$${p.costPerHr.toFixed(2)}/hr` : "N/A",
        uptimeSeconds: p.runtime?.uptimeInSeconds || 0,
      })),
    };
  }

  async _toolCreatePod(args) {
    const result = await this.provider.createPod({
      gpuTypeId: args.gpuTypeId,
      imageName: args.imageName,
      name: args.name,
      gpuCount: args.gpuCount,
      volumeInGb: args.volumeInGb,
      containerDiskInGb: args.containerDiskInGb,
      cloudType: args.cloudType,
      ports: args.ports,
    });

    return {
      message: `Pod created successfully!`,
      podId: result.podId,
      name: result.name,
      costPerHour: `$${result.costPerHour.toFixed(2)}/hr`,
      desiredStatus: result.desiredStatus,
      budgetRemaining: `$${(this.provider.maxBudgetUsd - this.provider.costAccumulated).toFixed(2)}`,
      autoStop: `TTL: ${this.provider.ttlMinutes}min, Idle: ${this.provider.idleShutdownMinutes}min`,
      tip: "Use runpod_pod_info to check when it's ready, then runpod_stop_pod when done.",
    };
  }

  async _toolStopPod() {
    const result = await this.provider.stopPod();
    return {
      message:
        "Pod stopped. Volume preserved — you can resume later by creating a new pod.",
      costFinal: `$${result.costFinal.toFixed(2)}`,
    };
  }

  async _toolTerminatePod() {
    const result = await this.provider.terminatePod();
    return {
      message: "Pod terminated and volume destroyed.",
      costFinal: `$${result.costFinal.toFixed(2)}`,
    };
  }

  async _toolPodInfo() {
    const info = await this.provider.getPodInfo();
    return {
      podId: info.id,
      name: info.name,
      status: info.desiredStatus,
      costPerHr: info.costPerHr ? `$${info.costPerHr.toFixed(2)}/hr` : "N/A",
      gpuCount: info.gpuCount,
      vcpuCount: info.vcpuCount,
      memoryGb: info.memoryInGb,
      gpus: info.runtime?.gpus?.map((g) => ({
        id: g.id,
        utilization: `${g.gpuUtilPercent}%`,
        memoryUtil: `${g.memoryUtilPercent}%`,
      })),
      ports: info.runtime?.ports?.map((p) => ({
        private: p.privatePort,
        public: p.publicPort,
        ip: p.ip,
        type: p.type,
      })),
      uptimeSeconds: info.runtime?.uptimeInSeconds || 0,
    };
  }

  async _toolRunJob(args) {
    const { endpointId, input, sync } = args;

    if (sync) {
      const result = await this.provider.runServerlessSync(endpointId, input);
      return {
        message: "Job completed (sync)",
        ...result,
      };
    }

    const result = await this.provider.runServerless(endpointId, input);
    return {
      message: "Job submitted (async)",
      jobId: result.id,
      status: result.status,
      tip: `Use runpod_job_status with endpointId="${endpointId}" and jobId="${result.id}" to check progress.`,
    };
  }

  async _toolJobStatus(args) {
    const { endpointId, jobId } = args;
    const result = await this.provider.getServerlessJobStatus(
      endpointId,
      jobId,
    );
    return {
      jobId,
      status: result.status,
      output: result.output,
      executionTime: result.executionTime,
    };
  }

  _toolSessionInfo() {
    if (!this.provider) {
      return { status: "disconnected", message: "Not connected to RunPod" };
    }
    return this.provider.getSessionInfo();
  }
}

// ─── Entry Point ────────────────────────────────────────────
// When run directly: start as MCP stdio server
// When imported: export the class + tool definitions

if (require.main === module) {
  const server = new RunPodMCPServer();
  server.start();
}

module.exports = { RunPodMCPServer, TOOLS };
