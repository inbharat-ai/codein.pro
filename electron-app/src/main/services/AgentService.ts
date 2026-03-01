/**
 * Agent Service
 * Manages CodIn Agent (i18n, voice, local LLM) integration
 */

import { ChildProcess, spawn } from "child_process";
import { app } from "electron";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";

export class AgentService {
  private agentProcess: ChildProcess | null = null;
  private agentPort: number = 43120; // CODIN_AGENT_PORT
  private isAgentReady: boolean = false;

  /**
   * Check if agent is running
   */
  public isRunning(): boolean {
    return this.agentProcess !== null && this.isAgentReady;
  }

  /**
   * Start the CodIn Agent service
   */
  public async start(): Promise<void> {
    if (this.agentProcess) {
      console.log("Agent already running");
      return;
    }

    console.log("Starting CodIn Agent...");

    try {
      // Get agent path
      const agentPath = this.getAgentPath();
      const nodeExecutable = this.getNodeExecutable();

      // Start agent process
      const bundledLlamaPath = this.getBundledLlamaPath();
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        CODIN_AGENT_PORT: this.agentPort.toString(),
      };

      if (bundledLlamaPath) {
        env.LLAMA_PATH = bundledLlamaPath;
      }

      this.agentProcess = spawn(
        nodeExecutable,
        [path.join(agentPath, "src", "index.js")],
        {
          cwd: agentPath,
          env: {
            ...env,
            ELECTRON_RUN_AS_NODE: "1", // Required so Electron binary acts as plain Node
          },
        },
      );

      // Setup logging
      this.agentProcess.stdout?.on("data", (data) => {
        console.log(`[Agent] ${data.toString()}`);
      });

      this.agentProcess.stderr?.on("data", (data) => {
        console.error(`[Agent Error] ${data.toString()}`);
      });

      this.agentProcess.on("exit", (code) => {
        console.log(`Agent process exited with code ${code}`);
        this.agentProcess = null;
        this.isAgentReady = false;
      });

      // Wait for agent to be ready
      await this.waitForAgent();
      this.isAgentReady = true;

      console.log("CodIn Agent started successfully");
    } catch (error) {
      console.error("Failed to start agent:", error);
      throw error;
    }
  }

  /**
   * Stop the CodIn Agent service
   */
  public async stop(): Promise<void> {
    if (!this.agentProcess) {
      return;
    }

    console.log("Stopping CodIn Agent...");
    this.agentProcess.kill();
    this.agentProcess = null;
    this.isAgentReady = false;
  }

  /**
   * Wait for agent to be ready
   */
  private async waitForAgent(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const isReady = await this.checkAgentHealth();
        if (isReady) {
          return;
        }
      } catch (error) {
        // Agent not ready yet
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("Agent failed to start within timeout");
  }

  /**
   * Check agent health
   */
  private async checkAgentHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://localhost:${this.agentPort}/health`,
        (res) => {
          resolve(res.statusCode === 200);
        },
      );

      req.on("error", () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Make API call to agent
   */
  private async callAgent(endpoint: string, data?: any): Promise<any> {
    if (!this.isRunning()) {
      throw new Error("Agent is not running");
    }

    return new Promise((resolve, reject) => {
      const postData = data ? JSON.stringify(data) : undefined;

      const options = {
        hostname: "localhost",
        port: this.agentPort,
        path: endpoint,
        method: postData ? "POST" : "GET",
        headers: postData
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postData),
            }
          : {},
      };

      const req = http.request(options, (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          try {
            const result = JSON.parse(body);
            resolve(result);
          } catch (error) {
            reject(new Error("Invalid JSON response"));
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      if (postData) {
        req.write(postData);
      }

      req.end();
    });
  }

  /**
   * Translate text
   */
  public async translate(
    text: string,
    fromLang: string,
    toLang: string,
  ): Promise<string> {
    const result = await this.callAgent("/api/translate", {
      text,
      source_language: fromLang,
      target_language: toLang,
    });
    return result.translation;
  }

  /**
   * Detect language
   */
  public async detectLanguage(text: string): Promise<string> {
    const result = await this.callAgent("/api/detect-language", { text });
    return result.language;
  }

  /**
   * Get supported languages
   */
  public async getSupportedLanguages(): Promise<any[]> {
    const result = await this.callAgent("/api/languages");
    return result.languages;
  }

  /**
   * Speech to text
   */
  public async speechToText(
    audioData: ArrayBuffer,
    language: string,
  ): Promise<string> {
    // STT is handled client-side via browser SpeechRecognition API
    return JSON.stringify({
      error: "STT is handled client-side via VoicePanel",
    });
  }

  /**
   * Text to speech
   */
  public async textToSpeech(
    text: string,
    language: string,
  ): Promise<ArrayBuffer> {
    // TTS is handled client-side via browser SpeechSynthesis API
    return new ArrayBuffer(0);
  }

  /**
   * Generate completion using local LLM
   */
  public async generateCompletion(
    prompt: string,
    options?: any,
  ): Promise<string> {
    const result = await this.callAgent("/api/completion", {
      prompt,
      ...options,
    });
    return result.completion;
  }

  /**
   * Stream completion using local LLM via Server-Sent Events.
   * Returns a stream ID that can be used to cancel the request.
   */
  public async streamCompletion(
    prompt: string,
    options: any,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    if (!this.isRunning()) {
      throw new Error("Agent is not running");
    }

    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const postData = JSON.stringify({ prompt, stream: true, ...options });

    return new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: this.agentPort,
          path: "/api/completion/stream",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
            Accept: "text/event-stream",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(
              new Error(`Stream request failed with status ${res.statusCode}`),
            );
            return;
          }

          let buffer = "";

          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();

            // Parse SSE frames
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // keep incomplete line in buffer

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                const payload = trimmed.slice(6);
                if (payload === "[DONE]") {
                  resolve(streamId);
                  return;
                }
                try {
                  const parsed = JSON.parse(payload);
                  const text =
                    parsed.choices?.[0]?.delta?.content ??
                    parsed.choices?.[0]?.text ??
                    parsed.content ??
                    parsed.token ??
                    "";
                  if (text) {
                    onChunk(text);
                  }
                } catch {
                  // Raw text chunk (non-JSON SSE)
                  if (payload) {
                    onChunk(payload);
                  }
                }
              }
            }
          });

          res.on("end", () => {
            resolve(streamId);
          });

          res.on("error", (err) => {
            reject(err);
          });
        },
      );

      req.on("error", (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Get agent installation path
   */
  private getAgentPath(): string {
    if (app.isPackaged) {
      // In production, agent is bundled in resources
      return path.join(process.resourcesPath, "agent");
    } else {
      // In development, use workspace path
      // __dirname = electron-app/dist/main/services/ → 5 levels up to workspace root
      return path.join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "..",
        "packages",
        "agent",
      );
    }
  }

  /**
   * Get Node executable
   * In packaged builds Electron's execPath is NOT a plain Node runtime,
   * so we look for a bundled node binary or fall back to PATH.
   */
  private getNodeExecutable(): string {
    if (app.isPackaged) {
      // Prefer bundled Node that ships with Electron
      const platform = process.platform;
      const nodeName = platform === "win32" ? "node.exe" : "node";

      // electron-builder can bundle a Node runtime into extraResources
      const bundledNode = path.join(process.resourcesPath, "node", nodeName);
      if (fs.existsSync(bundledNode)) {
        return bundledNode;
      }

      // Fall back to system PATH node — users must have Node installed
      return nodeName;
    }
    // In development the Electron binary also runs as Node when
    // ELECTRON_RUN_AS_NODE=1 is set
    return process.execPath;
  }

  /**
   * Resolve bundled llama-server path in packaged builds.
   * Checks resources/llama/{platform}/{arch}/ first (new layout),
   * then resources/llama/{platform}/ (legacy flat layout),
   * then resources/bin/ (oldest layout).
   * On macOS/Linux, ensures the binary is executable (chmod +x).
   * Returns null in development or when no bundled binary is present.
   */
  private getBundledLlamaPath(): string | null {
    if (!app.isPackaged) {
      return null;
    }

    const platform = process.platform;
    const arch = process.arch; // x64, arm64, ia32, etc.
    const executableName =
      platform === "win32" ? "llama-server.exe" : "llama-server";

    // Priority 1: new arch-aware path  resources/llama/{platform}/{arch}/llama-server
    const archAwarePath = path.join(
      process.resourcesPath,
      "llama",
      platform,
      arch,
      executableName,
    );
    // Priority 2: legacy flat path  resources/llama/{platform}/llama-server
    const legacyPlatformPath = path.join(
      process.resourcesPath,
      "llama",
      platform,
      executableName,
    );
    // Priority 3: oldest path  resources/bin/llama-server
    const legacyBinPath = path.join(
      process.resourcesPath,
      "bin",
      executableName,
    );

    const candidates = [archAwarePath, legacyPlatformPath, legacyBinPath];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        // Ensure executable permission on macOS/Linux
        if (platform !== "win32") {
          try {
            fs.chmodSync(candidate, 0o755);
          } catch {
            // Ignore — may already be executable or read-only filesystem
          }
        }
        return candidate;
      }
    }

    return null;
  }
}
