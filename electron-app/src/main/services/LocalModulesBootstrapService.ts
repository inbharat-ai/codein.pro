/**
 * Local Modules Bootstrap Service
 *
 * Best-effort installer-time bootstrap for:
 * - Local LLM runtime/model (via LLMBootstrapService)
 * - STT/TTS dependencies
 * - AI4Bharat Indic translation server
 *
 * Writes a status manifest for deferred installs when offline.
 */

import { spawn } from "child_process";
import { app } from "electron";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";

export type BootstrapStatus = {
  stage: "ready" | "deferred" | "error";
  message: string;
  updatedAt: string;
  nextAttemptAt?: string;
  details?: Record<string, any>;
};

export class LocalModulesBootstrapService {
  private statusPath: string;

  constructor() {
    const statusDir = path.join(app.getPath("userData"), "codein", "bootstrap");
    fs.mkdirSync(statusDir, { recursive: true });
    this.statusPath = path.join(statusDir, "local-modules.json");
  }

  async runInstallerBootstrap(
    force: boolean = false,
  ): Promise<BootstrapStatus> {
    const existing = this.readStatus();
    if (!force && existing && !this.shouldAttemptBootstrap(existing)) {
      return existing;
    }

    const online = await this.isOnline();
    if (!online) {
      const status: BootstrapStatus = {
        stage: "deferred",
        message: "Offline: local modules install deferred",
        updatedAt: new Date().toISOString(),
        nextAttemptAt: this.nextAttemptIso(6),
      };
      this.writeStatus(status);
      return status;
    }

    const agentRoot = this.resolveAgentRoot();
    const scriptPath = path.join(
      agentRoot,
      "scripts",
      "local-modules-bootstrap.cjs",
    );

    if (!fs.existsSync(scriptPath)) {
      const status: BootstrapStatus = {
        stage: "error",
        message: "Bootstrap script not found",
        updatedAt: new Date().toISOString(),
        nextAttemptAt: this.nextAttemptIso(12),
        details: { scriptPath },
      };
      this.writeStatus(status);
      return status;
    }

    const status = await this.runNodeScript(scriptPath, [
      "--statusPath",
      this.statusPath,
    ]);
    this.writeStatus(status);
    return status;
  }

  getStatus(): BootstrapStatus | null {
    return this.readStatus();
  }

  async retryBootstrap(): Promise<BootstrapStatus> {
    return this.runInstallerBootstrap(true);
  }

  private resolveAgentRoot(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "agent");
    }
    return path.join(__dirname, "..", "..", "..", "..", "packages", "agent");
  }

  private runNodeScript(
    scriptPath: string,
    args: string[],
  ): Promise<BootstrapStatus> {
    return new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        ["--run-as-node", scriptPath, ...args],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve({
            stage: "ready",
            message: "Local modules bootstrap complete",
            updatedAt: new Date().toISOString(),
          });
          return;
        }

        resolve({
          stage: "error",
          message: "Local modules bootstrap failed",
          updatedAt: new Date().toISOString(),
          nextAttemptAt: this.nextAttemptIso(12),
          details: { code, stderr: stderr.slice(-2000) },
        });
      });
    });
  }

  private writeStatus(status: BootstrapStatus): void {
    fs.writeFileSync(this.statusPath, JSON.stringify(status, null, 2), "utf8");
  }

  private readStatus(): BootstrapStatus | null {
    if (!fs.existsSync(this.statusPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(this.statusPath, "utf8"));
    } catch {
      return null;
    }
  }

  private shouldAttemptBootstrap(status: BootstrapStatus): boolean {
    if (status.stage === "ready") {
      return false;
    }
    if (!status.nextAttemptAt) {
      return true;
    }
    const nextAttempt = Date.parse(status.nextAttemptAt);
    if (Number.isNaN(nextAttempt)) {
      return true;
    }
    return Date.now() >= nextAttempt;
  }

  private nextAttemptIso(hours: number): string {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  private isOnline(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = https.request(
        {
          method: "HEAD",
          host: "huggingface.co",
          path: "/",
          timeout: 3000,
        },
        (res) => {
          resolve(res.statusCode !== undefined && res.statusCode < 500);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }
}
