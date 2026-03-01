/**
 * MediaService — Electron main-process service for CodeIn Media Toolkit
 *
 * Manages:
 * - Python media service process lifecycle (start, health-check, stop)
 * - Hardware detection
 * - All media operations (images, videos, diagrams)
 * - Model management
 *
 * All operations are LOCAL-ONLY (127.0.0.1).
 */

import { ChildProcess, spawn } from "child_process";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

type MediaModule = {
  createMediaToolkit: (opts: any) => Promise<any>;
  detectHardware: () => Promise<any>;
  summarizeHardware: (hw: any) => string;
  MediaMode: { AUTO: string; CPU_ONLY: string; GPU_ONLY: string };
  MediaServiceClient: new (opts?: { port?: number }) => {
    health: () => Promise<any>;
    isAlive: () => Promise<boolean>;
    modelsStatus: () => Promise<any>;
    downloadModel: (modelId: string) => Promise<any>;
    deleteModel: (modelId: string) => Promise<any>;
    generateImage: (params: any) => Promise<any>;
    generateVideo: (params: any) => Promise<any>;
    renderDiagram: (params: any) => Promise<any>;
    cancelJob: (jobId: string) => Promise<any>;
    subscribeProgress: (
      jobId: string,
      onProgress: (evt: any) => void,
    ) => { close: () => void };
  };
};

function loadMediaModule(): MediaModule {
  try {
    // Prefer installed package
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@codein/media");
  } catch {
    // Fallback to workspace path during development
    const fallbackPath = path.join(
      process.cwd(),
      "packages",
      "media",
      "src",
      "index.js",
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(fallbackPath);
  }
}

const DEFAULT_PORT = 43130;

export class MediaService {
  private pythonProcess: ChildProcess | null = null;
  private client: InstanceType<MediaModule["MediaServiceClient"]> | null = null;
  private toolkit: any = null;
  private hardware: any = null;
  private port: number = DEFAULT_PORT;
  private logDir: string;
  private progressSubscriptions = new Map<string, { close: () => void }>();

  constructor() {
    this.logDir = path.join(app.getPath("userData"), "codein", "logs", "media");
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  /**
   * Initialize the MediaService.
   * Starts the Python media service in the background.
   * Non-blocking — continues even if service fails to start.
   */
  public async initialize(): Promise<void> {
    try {
      await this.startService();
      console.log("[MediaService] Initialized successfully");
    } catch (error) {
      console.warn(
        "[MediaService] Auto-start failed, media features unavailable until manually started:",
        error,
      );
    }
  }

  // ── Python Process Lifecycle ───────────────────────────

  /**
   * Start the Python media service process.
   * Uses the venv if available, otherwise falls back to system python.
   */
  public async startService(): Promise<{ port: number; pid: number }> {
    if (this.pythonProcess && !this.pythonProcess.killed) {
      // Check if already running
      if (this.client && (await this.client.isAlive())) {
        return { port: this.port, pid: this.pythonProcess.pid! };
      }
    }

    const pythonPath = this.findPython();
    const appPath = this.findMediaPythonApp();

    const logFile = path.join(this.logDir, `media-service-${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    this.pythonProcess = spawn(
      pythonPath,
      [appPath, "--port", String(this.port)],
      {
        cwd: path.dirname(appPath),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          CODEIN_MODELS_DIR: path.join(
            app.getPath("userData"),
            "codein",
            "models",
            "media",
          ),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    this.pythonProcess.stdout?.pipe(logStream);
    this.pythonProcess.stderr?.pipe(logStream);

    this.pythonProcess.on("exit", (code) => {
      console.log(`[MediaService] Python process exited with code ${code}`);
      this.pythonProcess = null;
    });

    // Initialize client
    const media = loadMediaModule();
    this.client = new media.MediaServiceClient({ port: this.port });

    // Wait for service to be ready (up to 30s)
    const ready = await this.waitForReady(30000);
    if (!ready) {
      throw new Error("Media service failed to start within 30 seconds");
    }

    console.log(
      `[MediaService] Python service started on port ${this.port}, PID: ${this.pythonProcess?.pid}`,
    );
    return { port: this.port, pid: this.pythonProcess?.pid ?? 0 };
  }

  /** Stop the Python service */
  public async stopService(): Promise<void> {
    // Close all subscriptions
    for (const [jobId] of this.progressSubscriptions) {
      this.unsubscribeProgress(jobId);
    }

    if (this.pythonProcess && !this.pythonProcess.killed) {
      this.pythonProcess.kill("SIGTERM");
      // Wait a moment, then force kill
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (this.pythonProcess && !this.pythonProcess.killed) {
        this.pythonProcess.kill("SIGKILL");
      }
    }
    this.pythonProcess = null;
    this.client = null;
    this.toolkit = null;
    console.log("[MediaService] Stopped");
  }

  /** Wait for the Python service to respond to health checks */
  private async waitForReady(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (this.client && (await this.client.isAlive())) {
          return true;
        }
      } catch {
        // Service not yet up
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }

  /** Find python executable (check venv first) */
  private findPython(): string {
    const venvPaths = [
      path.join(
        process.cwd(),
        "packages",
        "media-python",
        ".venv",
        "Scripts",
        "python.exe",
      ),
      path.join(
        process.cwd(),
        "packages",
        "media-python",
        ".venv",
        "bin",
        "python",
      ),
      path.join(
        app.getPath("userData"),
        "codein",
        "media-venv",
        "Scripts",
        "python.exe",
      ),
      path.join(
        app.getPath("userData"),
        "codein",
        "media-venv",
        "bin",
        "python",
      ),
    ];
    for (const p of venvPaths) {
      if (fs.existsSync(p)) return p;
    }
    // Fallback to system python
    return process.platform === "win32" ? "python" : "python3";
  }

  /** Find the media-python app.py */
  private findMediaPythonApp(): string {
    const candidates = [
      path.join(process.cwd(), "packages", "media-python", "app.py"),
      path.join(
        __dirname,
        "..",
        "..",
        "..",
        "packages",
        "media-python",
        "app.py",
      ),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error("media-python app.py not found");
  }

  // ── Hardware Detection ─────────────────────────────────

  public async detectHardware(): Promise<any> {
    if (!this.hardware) {
      const media = loadMediaModule();
      this.hardware = await media.detectHardware();
    }
    return this.hardware;
  }

  public async getHardwareSummary(): Promise<string> {
    const hw = await this.detectHardware();
    const media = loadMediaModule();
    return media.summarizeHardware(hw);
  }

  // ── Health & Status ────────────────────────────────────

  public async health(): Promise<any> {
    await this.ensureServiceReady();
    return this.client!.health();
  }

  public async isReady(): Promise<boolean> {
    try {
      return this.client ? await this.client.isAlive() : false;
    } catch {
      return false;
    }
  }

  // ── Model Management ───────────────────────────────────

  public async modelsStatus(): Promise<any> {
    await this.ensureServiceReady();
    return this.client!.modelsStatus();
  }

  public async downloadModel(modelId: string): Promise<any> {
    await this.ensureServiceReady();
    return this.client!.downloadModel(modelId);
  }

  public async deleteModel(modelId: string): Promise<any> {
    await this.ensureServiceReady();
    return this.client!.deleteModel(modelId);
  }

  // ── Generation ─────────────────────────────────────────

  public async generateImage(params: any): Promise<any> {
    await this.ensureServiceReady();
    return this.client!.generateImage(params);
  }

  public async generateVideo(params: any): Promise<any> {
    await this.ensureServiceReady();
    return this.client!.generateVideo(params);
  }

  public async renderDiagram(params: any): Promise<any> {
    await this.ensureServiceReady();
    return this.client!.renderDiagram(params);
  }

  public async cancelJob(jobId: string): Promise<any> {
    if (!this.client) throw new Error("Media service not initialized");
    return this.client.cancelJob(jobId);
  }

  // ── Progress Subscriptions ─────────────────────────────

  public subscribeProgress(
    jobId: string,
    onProgress: (evt: any) => void,
  ): void {
    this.unsubscribeProgress(jobId);
    if (this.client) {
      const sub = this.client.subscribeProgress(jobId, onProgress);
      this.progressSubscriptions.set(jobId, sub);
    }
  }

  public unsubscribeProgress(jobId: string): void {
    const sub = this.progressSubscriptions.get(jobId);
    if (sub) {
      sub.close();
      this.progressSubscriptions.delete(jobId);
    }
  }

  // ── Shutdown ───────────────────────────────────────────

  public async shutdown(): Promise<void> {
    await this.stopService();
  }

  // ── Private ────────────────────────────────────────────

  private async ensureServiceReady(): Promise<void> {
    if (!this.client || !(await this.client.isAlive())) {
      await this.startService();
    }
  }
}
