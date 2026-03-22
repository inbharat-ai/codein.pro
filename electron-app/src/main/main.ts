/**
 * CodeIn Electron Main Process
 * Entry point for the standalone Electron application
 */

import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { buildAppMenu } from "./AppMenu";
import { WindowManager } from "./WindowManager";
import { IpcHandler } from "./ipc/IpcHandler";
import { AgentService } from "./services/AgentService";
import { AutoUpdateService } from "./services/AutoUpdateService";
import { ComputeLocalService } from "./services/ComputeLocalService";
import { FileSystemService } from "./services/FileSystemService";
import { GitService } from "./services/GitService";
import { LLMBootstrapService } from "./services/LLMBootstrapService";
import { LocalModulesBootstrapService } from "./services/LocalModulesBootstrapService";
import { MediaService } from "./services/MediaService";
import { ModelManagerService } from "./services/ModelManagerService";
import { TerminalService } from "./services/TerminalService";

// Fix PATH on macOS/Linux
if (process.platform !== "win32") {
  const fixPath = require("fix-path");
  fixPath();
}

class CodeInApp {
  private windowManager: WindowManager | null = null;
  private ipcHandler: IpcHandler | null = null;
  private fileSystemService: FileSystemService | null = null;
  private gitService: GitService | null = null;
  private terminalService: TerminalService | null = null;
  private modelManagerService: ModelManagerService | null = null;
  private agentService: AgentService | null = null;
  private computeLocalService: ComputeLocalService | null = null;
  private mediaService: MediaService | null = null;
  private llmBootstrapService: LLMBootstrapService | null = null;
  private localModulesBootstrapService: LocalModulesBootstrapService | null =
    null;
  private autoUpdateService: AutoUpdateService | null = null;

  constructor() {
    this.setupApp();
  }

  private setupApp(): void {
    // Single instance lock
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
      return;
    }

    app.on("second-instance", (event, commandLine, workingDirectory) => {
      // Someone tried to run a second instance, focus our window instead
      if (this.windowManager) {
        this.windowManager.focusMainWindow();
      }
    });

    // App event handlers
    app.on("ready", () => this.onReady());
    app.on("window-all-closed", () => this.onWindowAllClosed());
    app.on("activate", () => this.onActivate());
    app.on("before-quit", () => this.onBeforeQuit());
  }

  private async onReady(): Promise<void> {
    console.log("CodeIn: App ready, initializing...");

    if (process.argv.includes("--bootstrap-only")) {
      await this.runInstallerBootstrap();
      app.quit();
      return;
    }

    try {
      // Allow microphone and other media permissions for voice features
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, permission, callback) => {
          if (permission === "media") {
            callback(true);
          } else {
            callback(true);
          }
        },
      );

      // Create window manager and show the UI first
      this.windowManager = new WindowManager();
      buildAppMenu(this.windowManager);
      await this.windowManager.createMainWindow();
      console.log("CodeIn: Window created");

      // Initialize services (non-fatal — UI stays up even if backend is slow)
      try {
        await this.initializeServices();
        this.setupIpcHandlers();
        console.log("CodeIn: Initialization complete");
      } catch (serviceError) {
        console.warn("CodeIn: Some services failed to start:", serviceError);
      }

      // Initialize auto-update (non-blocking)
      this.autoUpdateService = new AutoUpdateService();
      const mainWin = this.windowManager.getMainWindow();
      if (mainWin) {
        this.autoUpdateService.setMainWindow(mainWin);
      }
      this.registerAutoUpdateIpc();
      this.autoUpdateService.checkForUpdates();
    } catch (error) {
      console.error("CodeIn: Failed to create window:", error);
      dialog.showErrorBox(
        "CodeIn failed to start",
        `${error instanceof Error ? error.message : String(error)}\n\nTry reinstalling the latest release.`,
      );
      app.quit();
    }
  }

  private async runInstallerBootstrap(): Promise<void> {
    console.log("CodeIn: Running installer bootstrap...");

    this.llmBootstrapService = new LLMBootstrapService((progress) => {
      console.log(
        `[LLM Bootstrap] ${progress.stage.toUpperCase()}: ${progress.message}`,
      );
      if (progress.error) {
        console.warn(`[LLM Bootstrap] Error: ${progress.error}`);
      }
    });

    this.localModulesBootstrapService = new LocalModulesBootstrapService();

    try {
      await this.llmBootstrapService.ensureReady(120000);
    } catch (error) {
      console.warn("[LLM Bootstrap] Installer bootstrap failed:", error);
    }

    try {
      await this.localModulesBootstrapService.runInstallerBootstrap();
    } catch (error) {
      console.warn(
        "[Local Modules Bootstrap] Installer bootstrap failed:",
        error,
      );
    }

    try {
      await this.llmBootstrapService.shutdown();
    } catch {
      // Non-critical
    }
  }

  private async initializeServices(): Promise<void> {
    // Initialize file system service
    this.fileSystemService = new FileSystemService();

    // Initialize git service (requires FileSystemService for workspace path)
    this.gitService = new GitService(this.fileSystemService);

    // Initialize terminal service
    this.terminalService = new TerminalService();

    // Initialize model manager service
    this.modelManagerService = new ModelManagerService();
    await this.modelManagerService.initialize();

    // Initialize LLM bootstrap service (auto-setup local LLM for Computer feature)
    // This runs in parallel with other services and logs warnings if it fails
    this.llmBootstrapService = new LLMBootstrapService((progress) => {
      console.log(
        `[LLM Bootstrap] ${progress.stage.toUpperCase()}: ${progress.message}`,
      );
      if (progress.error) {
        console.warn(`[LLM Bootstrap] Error: ${progress.error}`);
      }
      // Could emit to UI here for better UX
    });

    // Start LLM bootstrap in background — don't block app startup
    this.llmBootstrapService.ensureReady(60000).catch((err) => {
      console.warn("[LLM Bootstrap] Background initialization failed:", err);
    });

    // Best-effort local module bootstrap (STT/TTS/AI4Bharat). Defer if offline.
    this.localModulesBootstrapService = new LocalModulesBootstrapService();
    this.localModulesBootstrapService.runInstallerBootstrap().catch((err) => {
      console.warn(
        "[Local Modules Bootstrap] Background initialization failed:",
        err,
      );
    });

    // Initialize agent service (AI4Bharat + CodeIn Agent)
    this.agentService = new AgentService();
    this.agentService.start().catch((err) => {
      console.warn("[Agent] Background start failed:", err);
    });

    // Initialize compute-local service (local-only compute bridge)
    this.computeLocalService = new ComputeLocalService(this.agentService);

    // Initialize media service (local media generation)
    this.mediaService = new MediaService();
    this.mediaService.initialize().catch((err) => {
      console.warn("[Media] Background initialization failed:", err);
    });

    console.log("CodeIn: All services initialized");
  }

  private setupIpcHandlers(): void {
    if (
      !this.fileSystemService ||
      !this.gitService ||
      !this.terminalService ||
      !this.modelManagerService ||
      !this.agentService ||
      !this.computeLocalService ||
      !this.mediaService
    ) {
      console.warn(
        "CodeIn: Some services not yet ready for IPC — handlers may be limited",
      );
    }

    this.ipcHandler = new IpcHandler(
      this.fileSystemService!,
      this.gitService!,
      this.terminalService!,
      this.modelManagerService!,
      this.agentService!,
      this.computeLocalService!,
      this.mediaService!,
      this.llmBootstrapService!,
      this.localModulesBootstrapService!,
      this.windowManager!,
    );

    this.ipcHandler.register();
  }

  private registerAutoUpdateIpc(): void {
    ipcMain.on("download-update", async () => {
      if (this.autoUpdateService) {
        try {
          await this.autoUpdateService.downloadUpdate();
        } catch (err) {
          console.warn("[AutoUpdate] Download failed:", err);
        }
      }
    });

    ipcMain.on("quit-and-install", () => {
      if (this.autoUpdateService) {
        this.autoUpdateService.quitAndInstall();
      }
    });
  }

  private onWindowAllClosed(): void {
    // On macOS, keep app running even when all windows closed
    if (process.platform !== "darwin") {
      app.quit();
    }
  }

  private onActivate(): void {
    // On macOS, re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0 && this.windowManager) {
      this.windowManager.createMainWindow();
    }
  }

  private async onBeforeQuit(): Promise<void> {
    console.log("CodeIn: Shutting down...");

    // Stop agent service
    if (this.agentService) {
      await this.agentService.stop();
    }

    if (this.computeLocalService) {
      this.computeLocalService.shutdown();
    }

    // Stop media service
    if (this.mediaService) {
      await this.mediaService.shutdown();
    }

    // Stop LLM server
    if (this.llmBootstrapService) {
      await this.llmBootstrapService.shutdown();
    }

    // Clean up terminal sessions
    if (this.terminalService) {
      this.terminalService.cleanupAll();
    }
  }
}

// Create app instance
const codinApp = new CodeInApp();

// Handle uncaught exceptions — write to crash log + show dialog in packaged mode
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  try {
    const fs = require("fs");
    const path = require("path");
    const logDir = app.isReady()
      ? app.getPath("userData")
      : path.join(
          process.env.APPDATA || process.env.HOME || require("os").tmpdir(),
          "CodeIn",
        );
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "crash.log");
    const entry = `[${new Date().toISOString()}] uncaughtException: ${error.stack || error}\n`;
    fs.appendFileSync(logPath, entry);
  } catch {
    // Best-effort logging
  }
  try {
    if (app.isReady()) {
      dialog.showErrorBox(
        "CodeIn — Unexpected Error",
        `${error.message}\n\nThe app may be unstable. Check crash.log for details.`,
      );
    }
  } catch {
    // Dialog may not be available
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  try {
    const fs = require("fs");
    const path = require("path");
    const logDir = app.isReady()
      ? app.getPath("userData")
      : path.join(
          process.env.APPDATA || process.env.HOME || require("os").tmpdir(),
          "CodeIn",
        );
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "crash.log");
    const entry = `[${new Date().toISOString()}] unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}\n`;
    fs.appendFileSync(logPath, entry);
  } catch {
    // Best-effort logging
  }
});
