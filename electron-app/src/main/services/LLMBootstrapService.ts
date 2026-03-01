/**
 * LLM Bootstrap Service
 *
 * Manages auto-provisioning of local LLM for CodeIn Computer feature:
 * - Detects if llama.cpp server is already running
 * - Auto-downloads default model from Hugging Face if needed
 * - Starts llama.cpp process if not running
 * - Provides progress callbacks for UI
 *
 * All models stored in ~/.codin/models/llm/
 * Default model: Mistral-7B-Instruct (3.5 GB, good balance of speed/quality)
 *
 * Usage:
 *   const service = new LLMBootstrapService(onProgress);
 *   const ready = await service.ensureReady(timeout);
 */

import { ChildProcess, spawn } from "child_process";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_PORT = 43121;
const DEFAULT_MODEL_REPO = "TheBloke/Mistral-7B-Instruct-GGUF";
const DEFAULT_MODEL_FILE = "mistral-7b-instruct.Q4_K_M.gguf"; // 4.5 GB
const SMALL_MODEL_FILE = "mistral-7b-instruct.Q3_K_S.gguf"; // 2.8 GB, faster but slightly lower quality

type BootstrapProgress = {
  stage:
    | "checking"
    | "downloading"
    | "starting"
    | "waiting"
    | "ready"
    | "error";
  message: string;
  progress?: number; // 0-100 for download progress
  error?: string;
};

export class LLMBootstrapService {
  private llamaProcess: ChildProcess | null = null;
  private modelDir: string;
  private logDir: string;
  private port: number = DEFAULT_PORT;
  private onProgress: (status: BootstrapProgress) => void;
  private initialized = false;

  constructor(onProgress?: (status: BootstrapProgress) => void) {
    this.modelDir = path.join(
      app.getPath("userData"),
      "codein",
      "models",
      "llm",
    );
    this.logDir = path.join(app.getPath("userData"), "codein", "logs", "llm");
    fs.mkdirSync(this.modelDir, { recursive: true });
    fs.mkdirSync(this.logDir, { recursive: true });
    this.onProgress = onProgress || (() => {});
  }

  /**
   * Ensure LLM is ready (either already running or gets started)
   * @param timeoutMs Maximum time to wait
   * @returns true if ready, false if timeout
   */
  public async ensureReady(timeoutMs: number = 120000): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    const startTime = Date.now();

    try {
      this.report("checking", "Checking for local LLM server...");

      // Check if already running
      if (await this.isServerRunning()) {
        this.report("ready", "LLM Server is already running");
        this.initialized = true;
        return true;
      }

      // Check if we have a model
      const modelPath = await this.findOrDownloadModel();
      if (!modelPath) {
        this.report(
          "error",
          "Failed to obtain model",
          undefined,
          "Could not download model",
        );
        return false;
      }

      // Start the server
      this.report("starting", `Starting LLM server on port ${this.port}...`);
      const started = await this.startServer(modelPath);
      if (!started) {
        this.report(
          "error",
          "Failed to start LLM server",
          undefined,
          "Process exited",
        );
        return false;
      }

      // Wait for server to be ready
      this.report("waiting", "Waiting for LLM server to be ready...");
      const ready = await this.waitForServer(
        Math.max(30000, timeoutMs - (Date.now() - startTime)),
      );
      if (!ready) {
        this.report(
          "error",
          "LLM server failed to be ready",
          undefined,
          "Timeout",
        );
        return false;
      }

      this.report("ready", "✓ LLM ready for CodeIn Computer");
      this.initialized = true;
      return true;
    } catch (error) {
      this.report("error", "Unexpected error", undefined, String(error));
      return false;
    }
  }

  /**
   * Check if llama.cpp is already running on port
   */
  private async isServerRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const http = require("http");
      const options = {
        hostname: "127.0.0.1",
        port: this.port,
        path: "/health",
        method: "GET",
        timeout: 2000,
      };

      const req = http.request(options, (res: any) => {
        resolve(res.statusCode === 200);
      });

      req.on("error", () => {
        resolve(false);
      });

      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Find an existing model or download the default one
   */
  private async findOrDownloadModel(): Promise<string | null> {
    // Try to find existing models in order of preference
    const candidates = [
      DEFAULT_MODEL_FILE,
      SMALL_MODEL_FILE,
      "mistral-7b-instruct.Q2_K.gguf",
    ];

    for (const fileName of candidates) {
      const modelPath = path.join(this.modelDir, fileName);
      if (fs.existsSync(modelPath)) {
        console.log(`[LLMBootstrap] Found existing model: ${fileName}`);
        return modelPath;
      }
    }

    // Download default model
    return await this.downloadModel(DEFAULT_MODEL_REPO, SMALL_MODEL_FILE);
  }

  /**
   * Download model from Hugging Face using a lightweight approach
   * Falls back gracefully if download fails
   */
  private async downloadModel(
    repo: string,
    file: string,
  ): Promise<string | null> {
    const modelPath = path.join(this.modelDir, file);
    const url = `https://huggingface.co/${repo}/resolve/main/${file}`;

    this.report("downloading", `Downloading ${file} from Hugging Face...`, 0);

    try {
      // Use curl if available (more reliable than node https for large files)
      const curl = require("child_process").execSync;
      const curlCmd = `curl -L --progress-bar -o "${modelPath}" "${url}"`;

      return await new Promise((resolve) => {
        const child = spawn(
          "curl",
          ["-L", "--progress-bar", "-o", modelPath, url],
          {
            stdio: ["ignore", "inherit", "inherit"],
            shell: true,
            timeout: 3600000, // 1 hour for large downloads
          },
        );

        child.on("close", (code) => {
          if (code === 0 && fs.existsSync(modelPath)) {
            console.log(`[LLMBootstrap] Downloaded model to ${modelPath}`);
            resolve(modelPath);
          } else {
            // Fallback: try Node.js built-in https
            this.downloadModelViaNodeHTTPS(modelPath, url)
              .then((path) => resolve(path))
              .catch(() => resolve(null));
          }
        });
      });
    } catch (error) {
      console.warn("[LLMBootstrap] curl failed, trying Node HTTPS:", error);
      return await this.downloadModelViaNodeHTTPS(modelPath, url);
    }
  }

  /**
   * Fallback download using Node.js https
   */
  private async downloadModelViaNodeHTTPS(
    modelPath: string,
    url: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const https = require("https");
      const file = fs.createWriteStream(modelPath);
      let lastReport = Date.now();
      let lastSize = 0;

      https
        .get(url, (response: any) => {
          const total = parseInt(response.headers["content-length"] || "0");
          let current = 0;

          response.on("data", (chunk: Buffer) => {
            current += chunk.length;
            const now = Date.now();
            if (now - lastReport > 1000) {
              // Report every second
              const progress =
                total > 0 ? Math.round((current / total) * 100) : 0;
              const speed = ((current - lastSize) / (1024 * 1024)).toFixed(1);
              this.report(
                "downloading",
                `Downloading... ${progress}% (${speed} MB/s)`,
                progress,
              );
              lastReport = now;
              lastSize = current;
            }
          });

          response.pipe(file);
          file.on("finish", () => {
            file.close();
            console.log(
              `[LLMBootstrap] Downloaded model via HTTPS to ${modelPath}`,
            );
            resolve(modelPath);
          });

          file.on("error", () => {
            fs.unlink(modelPath, () => {}); // Clean up partial file
            resolve(null);
          });
        })
        .on("error", () => {
          fs.unlink(modelPath, () => {}); // Clean up partial file
          resolve(null);
        });
    });
  }

  /**
   * Start llama.cpp server process
   */
  private async startServer(modelPath: string): Promise<boolean> {
    try {
      // Find llama.cpp executable
      const llamaCppExe = this.findLlamaCppExecutable();
      if (!llamaCppExe) {
        console.warn(
          "[LLMBootstrap] llama.cpp not found, Computer feature unavailable until manually set up",
        );
        return false;
      }

      const logFile = path.join(this.logDir, `llama-${Date.now()}.log`);
      const logStream = fs.createWriteStream(logFile, { flags: "a" });

      // Start with reasonable defaults for Mistral-7B
      this.llamaProcess = spawn(llamaCppExe, [
        "-m",
        modelPath,
        "--port",
        String(this.port),
        "-c",
        "2048", // context size
        "-n",
        "512", // max tokens to generate
        "-ngl",
        "99", // offload all layers to GPU if available
        "--log-disable", // disable verbose logging
        "-t",
        "4", // threads
      ]);

      this.llamaProcess.stdout?.pipe(logStream);
      this.llamaProcess.stderr?.pipe(logStream);

      this.llamaProcess.on("error", (err) => {
        console.error("[LLMBootstrap] Process error:", err);
      });

      this.llamaProcess.on("exit", (code) => {
        console.log(`[LLMBootstrap] llama.cpp server exited with code ${code}`);
        this.llamaProcess = null;
      });

      return true;
    } catch (error) {
      console.error("[LLMBootstrap] Failed to start server:", error);
      return false;
    }
  }

  /**
   * Find llama.cpp executable
   * Check common install locations
   */
  private findLlamaCppExecutable(): string | null {
    const candidates = [
      // Standard install paths
      path.join(app.getPath("appData"), "codein", "bin", "llama-server"),
      path.join(app.getPath("appData"), "codein", "bin", "llama-server.exe"),
      // Bundled with app
      path.join(app.getAppPath(), "bin", "llama-server"),
      path.join(app.getAppPath(), "bin", "llama-server.exe"),
      // System PATH (will need shell: true)
      "llama-server",
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // Ignore
      }
    }

    return null;
  }

  /**
   * Wait for server to respond to health check
   */
  private async waitForServer(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isServerRunning()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return false;
  }

  /**
   * Report progress to callback
   */
  private report(
    stage: BootstrapProgress["stage"],
    message: string,
    progress?: number,
    error?: string,
  ): void {
    console.log(`[LLMBootstrap] ${stage.toUpperCase()}: ${message}`);
    this.onProgress({
      stage,
      message,
      progress,
      error,
    });
  }

  /**
   * Shutdown the LLM server
   */
  public async shutdown(): Promise<void> {
    if (this.llamaProcess && !this.llamaProcess.killed) {
      console.log("[LLMBootstrap] Stopping llama.cpp server...");
      this.llamaProcess.kill();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
