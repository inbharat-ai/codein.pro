import * as path from "path";

import { AgentService } from "./AgentService";

type ComputeLocalModule = {
  ComputeLocalClient: new (options?: { baseUrl?: string }) => {
    submitJob: (params: any) => Promise<any>;
    listJobs: (params?: any) => Promise<any>;
    getJob: (jobId: string) => Promise<any>;
    deleteJob: (jobId: string) => Promise<any>;
    cancelJob: (jobId: string) => Promise<any>;
    pauseJob: (jobId: string) => Promise<any>;
    resumeJob: (jobId: string) => Promise<any>;
    getStats: () => Promise<any>;
    listLanguages: () => Promise<any>;
    runWorkflow: (name: string, body?: any) => Promise<any>;
    subscribeToJobEvents: (
      jobId: string,
      onEvent: (event: any) => void,
    ) => { close: () => void };
  };
};

function loadComputeLocal(): ComputeLocalModule {
  try {
    // Prefer a local dependency if installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("compute-local");
  } catch {
    // Fallback to workspace path during development.
    const fallbackPath = path.join(
      process.cwd(),
      "packages",
      "compute-local",
      "src",
      "index.js",
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(fallbackPath);
  }
}

export class ComputeLocalService {
  private client: InstanceType<ComputeLocalModule["ComputeLocalClient"]>;
  private subscriptions = new Map<string, { close: () => void }>();

  constructor(private agentService: AgentService) {
    const computeLocal = loadComputeLocal();
    this.client = new computeLocal.ComputeLocalClient();
  }

  public async submitJob(params: any): Promise<any> {
    await this.ensureAgentReady();
    return this.client.submitJob(params);
  }

  public async listJobs(params?: any): Promise<any> {
    await this.ensureAgentReady();
    return this.client.listJobs(params);
  }

  public async getJob(jobId: string): Promise<any> {
    await this.ensureAgentReady();
    return this.client.getJob(jobId);
  }

  public async deleteJob(jobId: string): Promise<any> {
    await this.ensureAgentReady();
    return this.client.deleteJob(jobId);
  }

  public async cancelJob(jobId: string): Promise<any> {
    await this.ensureAgentReady();
    return this.client.cancelJob(jobId);
  }

  public async pauseJob(jobId: string): Promise<any> {
    await this.ensureAgentReady();
    return this.client.pauseJob(jobId);
  }

  public async resumeJob(jobId: string): Promise<any> {
    await this.ensureAgentReady();
    return this.client.resumeJob(jobId);
  }

  public async getStats(): Promise<any> {
    await this.ensureAgentReady();
    return this.client.getStats();
  }

  public async listLanguages(): Promise<any> {
    await this.ensureAgentReady();
    return this.client.listLanguages();
  }

  public async runWorkflow(name: string, body?: any): Promise<any> {
    await this.ensureAgentReady();
    return this.client.runWorkflow(name, body);
  }

  public subscribe(jobId: string, onEvent: (payload: any) => void): void {
    this.unsubscribe(jobId);
    const subscription = this.client.subscribeToJobEvents(jobId, onEvent);
    this.subscriptions.set(jobId, subscription);
  }

  public unsubscribe(jobId: string): void {
    const subscription = this.subscriptions.get(jobId);
    if (subscription) {
      subscription.close();
      this.subscriptions.delete(jobId);
    }
  }

  public shutdown(): void {
    for (const [jobId] of this.subscriptions) {
      this.unsubscribe(jobId);
    }
  }

  private async ensureAgentReady(): Promise<void> {
    if (!this.agentService.isRunning()) {
      await this.agentService.start();
    }
  }
}
