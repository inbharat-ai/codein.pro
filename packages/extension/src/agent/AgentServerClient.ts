/**
 * AgentServerClient - Bridges VS Code Extension to CodingAgent Server
 *
 * Provides client API for:
 * - Task orchestration (send goal → get TaskId)
 * - Event streaming (SSE for progress updates)
 * - Permission requests (show dialog → send approval)
 * - Session management
 */

import { logger } from "./logger";

export interface TaskRequest {
  goal: string;
  topology?: "mesh" | "hierarchical" | "ring" | "star";
  context?: Record<string, any>;
  acceptanceCriteria?: string;
}

export interface TaskResponse {
  taskId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  goal: string;
}

export interface EventUpdate {
  type:
    | "task_running"
    | "node_started"
    | "node_completed"
    | "permission_request"
    | "task_completed"
    | "error";
  taskId: string;
  data: Record<string, any>;
  timestamp: string;
}

export interface PermissionRequest {
  requestId: string;
  agentId: string;
  type: "FILE_WRITE" | "COMMAND_RUN" | "GPU_SPEND" | "MCP_TOOL_CALL";
  description: string;
  details: Record<string, any>;
}

export class AgentServerClient {
  private baseUrl: string;
  private eventSource: EventSource | null = null;
  private connectionStatus: "connected" | "disconnected" | "error" =
    "disconnected";
  private listeners = {
    onEvent: [] as ((event: EventUpdate) => void)[],
    onPermission: [] as ((request: PermissionRequest) => void)[],
    onConnectionStatusChange: [] as ((status: string) => void)[],
  };

  constructor(
    private agentPort: number = 43120,
    private host: string = "localhost",
  ) {
    this.baseUrl = `http://${this.host}:${this.agentPort}`;
    this.startHealthCheck();
  }

  /**
   * Periodic health check (every 5 seconds)
   */
  private startHealthCheck() {
    setInterval(() => {
      this.checkHealth().catch(() => {
        // Silent fail, just update status
      });
    }, 5000);
  }

  /**
   * Check if agent server is running
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(2000),
      });

      const wasConnected = this.connectionStatus === "connected";
      this.connectionStatus = response.ok ? "connected" : "error";

      if (wasConnected && this.connectionStatus !== "connected") {
        this.notifyConnectionStatusChange("disconnected");
      } else if (!wasConnected && this.connectionStatus === "connected") {
        this.notifyConnectionStatusChange("connected");
        this.connectToEventStream();
      }

      return response.ok;
    } catch (error) {
      const wasConnected = this.connectionStatus === "connected";
      this.connectionStatus = "disconnected";

      if (wasConnected) {
        this.notifyConnectionStatusChange("disconnected");
      }

      return false;
    }
  }

  /**
   * Submit a task to the agent server
   */
  async submitTask(request: TaskRequest): Promise<TaskResponse> {
    const response = await fetch(`${this.baseUrl}/swarm/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit task: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<TaskResponse> {
    const response = await fetch(`${this.baseUrl}/swarm/tasks/${taskId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to get task status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get task results
   */
  async getTaskResults(taskId: string): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/swarm/tasks/${taskId}/results`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get task results: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<{ success: boolean }> {
    const response = await fetch(
      `${this.baseUrl}/swarm/tasks/${taskId}/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to cancel task: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Connect to SSE event stream
   */
  connectToEventStream() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource(`${this.baseUrl}/swarm/events`);

      this.eventSource.onmessage = (event) => {
        try {
          const update: EventUpdate = JSON.parse(event.data);
          this.notifyEvent(update);
        } catch (error) {
          logger.error("Failed to parse event", error);
        }
      };

      this.eventSource.onerror = () => {
        logger.error("Event stream error");
        this.eventSource?.close();
        this.eventSource = null;
        this.connectionStatus = "error";
        this.notifyConnectionStatusChange("error");
      };
    } catch (error) {
      logger.error("Failed to connect to event stream", error);
      this.connectionStatus = "error";
      this.notifyConnectionStatusChange("error");
    }
  }

  /**
   * Respond to a permission request
   */
  async respondToPermission(
    requestId: string,
    accepted: boolean,
  ): Promise<{ success: boolean }> {
    const response = await fetch(
      `${this.baseUrl}/swarm/permissions/${requestId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: accepted ? "approve_once" : "deny",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to respond to permission: ${response.statusText}`,
      );
    }

    return response.json();
  }

  /**
   * Get pending permissions
   */
  async getPendingPermissions(): Promise<PermissionRequest[]> {
    const response = await fetch(`${this.baseUrl}/swarm/permissions`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get pending permissions: ${response.statusText}`,
      );
    }

    const result = await response.json();
    return result.pending || [];
  }

  /**
   * Event listener registration
   */
  onEvent(callback: (event: EventUpdate) => void) {
    this.listeners.onEvent.push(callback);
  }

  /**
   * Permission request listener registration
   */
  onPermission(callback: (request: PermissionRequest) => void) {
    this.listeners.onPermission.push(callback);
  }

  /**
   * Connection status change listener
   */
  onConnectionStatusChange(callback: (status: string) => void) {
    this.listeners.onConnectionStatusChange.push(callback);
  }

  /**
   * Internal event notification
   */
  private notifyEvent(event: EventUpdate) {
    logger.info(`Event: ${event.type} for task ${event.taskId}`);

    // Check if this is a permission request
    if (event.type === "permission_request") {
      const permRequest = event.data as PermissionRequest;
      this.listeners.onPermission.forEach((cb) => cb(permRequest));
    }

    // Notify all event listeners
    this.listeners.onEvent.forEach((cb) => cb(event));
  }

  /**
   * Internal connection status notification
   */
  private notifyConnectionStatusChange(status: string) {
    logger.info(`Connection status: ${status}`);
    this.listeners.onConnectionStatusChange.forEach((cb) => cb(status));
  }

  /**
   * Cleanup on dispose
   */
  dispose() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// Singleton instance
let clientInstance: AgentServerClient | null = null;

export function getAgentServerClient(
  port?: number,
  host?: string,
): AgentServerClient {
  if (!clientInstance) {
    clientInstance = new AgentServerClient(port, host);
  }
  return clientInstance;
}
