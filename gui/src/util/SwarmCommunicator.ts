/**
 * GUI-side Agent Server Communication Bridge
 *
 * The GUI (React app in VS Code webview) makes direct HTTP calls to the
 * Agent Server running on localhost:43120. The server is started by the
 * VS Code extension during activation.
 */

export interface SwarmTaskRequest {
  goal: string;
  topology?: "mesh" | "hierarchical" | "ring" | "star";
  context?: Record<string, any>;
  acceptanceCriteria?: string;
}

export interface SwarmTaskResponse {
  taskId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  goal: string;
}

export interface SwarmEvent {
  type: string;
  taskId: string;
  data: Record<string, any>;
  timestamp: string;
}

export class SwarmCommunicator {
  private baseUrl = "http://localhost:43120";
  private eventListeners: ((event: SwarmEvent) => void)[] = [];
  private eventSource: EventSource | null = null;

  constructor(private port: number = 43120) {
    this.baseUrl = `http://localhost:${port}`;
    this.connectToEventStream();
  }

  /**
   * Submit a task to the swarm
   */
  async submitTask(request: SwarmTaskRequest): Promise<SwarmTaskResponse> {
    const response = await fetch(`${this.baseUrl}/swarm/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to submit task: ${error}`);
    }

    return response.json();
  }

  /**
   * Get task status (can be polled or streamed)
   */
  async getTaskStatus(taskId: string): Promise<SwarmTaskResponse> {
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
   * Respond to a permission request
   */
  async respondToPermission(
    requestId: string,
    approved: boolean,
  ): Promise<{ success: boolean }> {
    const response = await fetch(
      `${this.baseUrl}/swarm/permissions/${requestId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: approved ? "approve_once" : "deny",
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
   * Check if agent server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/swarm/status`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Listen for swarm events
   */
  addEventListener(callback: (event: SwarmEvent) => void) {
    this.eventListeners.push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: (event: SwarmEvent) => void) {
    const index = this.eventListeners.indexOf(callback);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Connect to SSE event stream
   */
  private connectToEventStream() {
    try {
      this.eventSource = new EventSource(`${this.baseUrl}/swarm/events`);

      this.eventSource.onmessage = (event) => {
        try {
          const update: SwarmEvent = JSON.parse(event.data);
          this.eventListeners.forEach((cb) => cb(update));
        } catch (error) {
          console.error("Failed to parse swarm event", error);
        }
      };

      this.eventSource.onerror = () => {
        console.error("Swarm event stream error");
        this.disconnectEventStream();
        // Retry in 5 seconds
        setTimeout(() => this.connectToEventStream(), 5000);
      };
    } catch (error) {
      console.error("Failed to connect to swarm event stream", error);
    }
  }

  /**
   * Disconnect from event stream
   */
  private disconnectEventStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    this.disconnectEventStream();
    this.eventListeners = [];
  }
}
