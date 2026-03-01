/**
 * IPC Handler
 * Registers all IPC handlers for communication between main and renderer
 */

import { app, dialog, ipcMain, shell } from "electron";
import { AgentService } from "../services/AgentService";
import { ComputeLocalService } from "../services/ComputeLocalService";
import { FileSystemService } from "../services/FileSystemService";
import { GitService } from "../services/GitService";
import { LLMBootstrapService } from "../services/LLMBootstrapService";
import { LocalModulesBootstrapService } from "../services/LocalModulesBootstrapService";
import { MediaService } from "../services/MediaService";
import { ModelManagerService } from "../services/ModelManagerService";
import { TerminalService } from "../services/TerminalService";
import { WindowManager } from "../WindowManager";

export class IpcHandler {
  constructor(
    private fileSystemService: FileSystemService,
    private gitService: GitService,
    private terminalService: TerminalService,
    private modelManagerService: ModelManagerService,
    private agentService: AgentService,
    private computeLocalService: ComputeLocalService,
    private mediaService: MediaService,
    private llmBootstrapService: LLMBootstrapService,
    private localModulesBootstrapService: LocalModulesBootstrapService,
    private windowManager: WindowManager,
  ) {}

  /**
   * Safe wrapper for ipcMain.handle — catches exceptions and re-throws
   * so the renderer's ipcRenderer.invoke() promise rejects properly.
   * Also logs errors for main-process diagnostics.
   */
  private safeHandle(
    channel: string,
    handler: (
      event: Electron.IpcMainInvokeEvent,
      ...args: any[]
    ) => Promise<any>,
  ): void {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args);
      } catch (err: any) {
        console.error(`[IPC] ${channel} error:`, err);
        // Re-throw so ipcRenderer.invoke() rejects with a proper Error
        throw new Error(err?.message ?? String(err));
      }
    });
  }

  /**
   * Register all IPC handlers
   */
  public register(): void {
    this.registerFileSystemHandlers();
    this.registerGitHandlers();
    this.registerTerminalHandlers();
    this.registerModelManagerHandlers();
    this.registerAgentHandlers();
    this.registerComputeHandlers();
    this.registerMediaHandlers();
    this.registerLLMHandlers();
    this.registerBootstrapHandlers();
    this.registerSystemHandlers();
    this.registerWindowHandlers();
  }

  /**
   * File system handlers
   */
  private registerFileSystemHandlers(): void {
    this.safeHandle("fs:readFile", async (_, filepath: string) => {
      return await this.fileSystemService.readFile(filepath);
    });

    this.safeHandle(
      "fs:writeFile",
      async (_, filepath: string, content: string) => {
        return await this.fileSystemService.writeFile(filepath, content);
      },
    );

    this.safeHandle("fs:deleteFile", async (_, filepath: string) => {
      return await this.fileSystemService.deleteFile(filepath);
    });

    this.safeHandle(
      "fs:renameFile",
      async (_, oldPath: string, newPath: string) => {
        return await this.fileSystemService.renameFile(oldPath, newPath);
      },
    );

    this.safeHandle("fs:readDir", async (_, dirpath: string) => {
      return await this.fileSystemService.readDir(dirpath);
    });

    this.safeHandle("fs:createDir", async (_, dirpath: string) => {
      return await this.fileSystemService.createDir(dirpath);
    });

    this.safeHandle("fs:deleteDir", async (_, dirpath: string) => {
      return await this.fileSystemService.deleteDir(dirpath);
    });

    this.safeHandle("fs:fileExists", async (_, filepath: string) => {
      return await this.fileSystemService.fileExists(filepath);
    });

    this.safeHandle("fs:getFileStats", async (_, filepath: string) => {
      return await this.fileSystemService.getFileStats(filepath);
    });

    this.safeHandle("fs:openFolder", async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      const folderPath = result.filePaths[0];
      await this.fileSystemService.setWorkspacePath(folderPath);
      return folderPath;
    });

    this.safeHandle("fs:getWorkspacePath", async () => {
      return this.fileSystemService.getWorkspacePath();
    });

    this.safeHandle("fs:setWorkspacePath", async (_, path: string) => {
      return await this.fileSystemService.setWorkspacePath(path);
    });

    ipcMain.on("fs:watch", (_, pattern: string) => {
      this.fileSystemService.watchFiles(pattern, (event, path) => {
        this.windowManager.sendToMainWindow("fs:fileChanged", event, path);
      });
    });

    ipcMain.on("fs:unwatch", (_, pattern: string) => {
      this.fileSystemService.unwatchFiles(pattern);
    });
  }

  /**
   * Git handlers
   */
  private registerGitHandlers(): void {
    this.safeHandle("git:status", async () => {
      return await this.gitService.status();
    });

    this.safeHandle("git:diff", async (_, filepath?: string) => {
      return await this.gitService.diff(filepath);
    });

    this.safeHandle(
      "git:commit",
      async (_, message: string, files?: string[]) => {
        return await this.gitService.commit(message, files);
      },
    );

    this.safeHandle("git:branch", async () => {
      return await this.gitService.branch();
    });

    this.safeHandle("git:checkout", async (_, branch: string) => {
      return await this.gitService.checkout(branch);
    });

    this.safeHandle("git:log", async (_, count?: number) => {
      return await this.gitService.log(count);
    });
  }

  /**
   * Terminal handlers
   */
  private registerTerminalHandlers(): void {
    this.safeHandle("terminal:create", async (_, cwd?: string) => {
      const id = await this.terminalService.create(cwd);

      // Setup event forwarding
      this.terminalService.onData(id, (data) => {
        this.windowManager.sendToMainWindow("terminal:data", id, data);
      });

      this.terminalService.onExit(id, (code) => {
        this.windowManager.sendToMainWindow("terminal:exit", id, code);
      });

      return id;
    });

    this.safeHandle("terminal:write", async (_, id: string, data: string) => {
      return await this.terminalService.write(id, data);
    });

    this.safeHandle(
      "terminal:resize",
      async (_, id: string, cols: number, rows: number) => {
        return await this.terminalService.resize(id, cols, rows);
      },
    );

    this.safeHandle("terminal:kill", async (_, id: string) => {
      return await this.terminalService.kill(id);
    });
  }

  /**
   * Model manager handlers
   */
  private registerModelManagerHandlers(): void {
    this.safeHandle("models:list", async () => {
      return await this.modelManagerService.listModels();
    });

    this.safeHandle("models:download", async (_, modelId: string) => {
      return await this.modelManagerService.downloadModel(
        modelId,
        (progress) => {
          this.windowManager.sendToMainWindow(
            "models:downloadProgress",
            progress,
          );
        },
      );
    });

    this.safeHandle("models:delete", async (_, modelId: string) => {
      return await this.modelManagerService.deleteModel(modelId);
    });

    this.safeHandle("models:getInfo", async (_, modelId: string) => {
      return await this.modelManagerService.getModelInfo(modelId);
    });

    this.safeHandle("models:setActive", async (_, modelId: string) => {
      return await this.modelManagerService.setActiveModel(modelId);
    });

    this.safeHandle("models:getActive", async () => {
      return await this.modelManagerService.getActiveModel();
    });
  }

  /**
   * Agent/AI handlers
   */
  private registerAgentHandlers(): void {
    this.safeHandle("agent:isRunning", async () => {
      return this.agentService.isRunning();
    });

    this.safeHandle("agent:start", async () => {
      return await this.agentService.start();
    });

    this.safeHandle("agent:stop", async () => {
      return await this.agentService.stop();
    });

    this.safeHandle(
      "agent:translate",
      async (_, text: string, fromLang: string, toLang: string) => {
        return await this.agentService.translate(text, fromLang, toLang);
      },
    );

    this.safeHandle("agent:detectLanguage", async (_, text: string) => {
      return await this.agentService.detectLanguage(text);
    });

    this.safeHandle("agent:getSupportedLanguages", async () => {
      return await this.agentService.getSupportedLanguages();
    });

    this.safeHandle(
      "agent:speechToText",
      async (_, audioData: ArrayBuffer, language: string) => {
        return await this.agentService.speechToText(audioData, language);
      },
    );

    this.safeHandle(
      "agent:textToSpeech",
      async (_, text: string, language: string) => {
        return await this.agentService.textToSpeech(text, language);
      },
    );

    this.safeHandle(
      "agent:generateCompletion",
      async (_, prompt: string, options?: any) => {
        return await this.agentService.generateCompletion(prompt, options);
      },
    );

    this.safeHandle(
      "agent:streamCompletion",
      async (_, prompt: string, options?: any) => {
        const streamId = await this.agentService.streamCompletion(
          prompt,
          options,
          (chunk) => {
            this.windowManager.sendToMainWindow("agent:streamChunk", chunk);
          },
        );
        return streamId;
      },
    );
  }

  /**
   * Compute-local handlers
   */
  private registerComputeHandlers(): void {
    this.safeHandle("compute:submitJob", async (_, payload: any) => {
      return await this.computeLocalService.submitJob(payload);
    });

    this.safeHandle("compute:listJobs", async (_, filters?: any) => {
      return await this.computeLocalService.listJobs(filters);
    });

    this.safeHandle("compute:getJob", async (_, jobId: string) => {
      return await this.computeLocalService.getJob(jobId);
    });

    this.safeHandle("compute:deleteJob", async (_, jobId: string) => {
      return await this.computeLocalService.deleteJob(jobId);
    });

    this.safeHandle("compute:cancelJob", async (_, jobId: string) => {
      return await this.computeLocalService.cancelJob(jobId);
    });

    this.safeHandle("compute:pauseJob", async (_, jobId: string) => {
      return await this.computeLocalService.pauseJob(jobId);
    });

    this.safeHandle("compute:resumeJob", async (_, jobId: string) => {
      return await this.computeLocalService.resumeJob(jobId);
    });

    this.safeHandle("compute:getStats", async () => {
      return await this.computeLocalService.getStats();
    });

    this.safeHandle("compute:listLanguages", async () => {
      return await this.computeLocalService.listLanguages();
    });

    this.safeHandle(
      "compute:runWorkflow",
      async (_, name: string, body?: any) => {
        return await this.computeLocalService.runWorkflow(name, body);
      },
    );

    this.safeHandle("compute:subscribe", async (_, jobId: string) => {
      this.computeLocalService.subscribe(jobId, (payload: any) => {
        this.windowManager.sendToMainWindow(
          "compute:event",
          jobId,
          payload.event,
          payload.data,
        );
      });
      return { subscribed: true };
    });

    this.safeHandle("compute:unsubscribe", async (_, jobId: string) => {
      this.computeLocalService.unsubscribe(jobId);
      return { unsubscribed: true };
    });
  }

  /**
   * Media toolkit handlers
   */
  private registerMediaHandlers(): void {
    this.safeHandle("media:health", async () => {
      return await this.mediaService.health();
    });

    this.safeHandle("media:isReady", async () => {
      return await this.mediaService.isReady();
    });

    this.safeHandle("media:startService", async () => {
      return await this.mediaService.startService();
    });

    this.safeHandle("media:stopService", async () => {
      return await this.mediaService.stopService();
    });

    this.safeHandle("media:detectHardware", async () => {
      return await this.mediaService.detectHardware();
    });

    this.safeHandle("media:hardwareSummary", async () => {
      return await this.mediaService.getHardwareSummary();
    });

    this.safeHandle("media:generateImage", async (_, params: any) => {
      return await this.mediaService.generateImage(params);
    });

    this.safeHandle("media:generateVideo", async (_, params: any) => {
      return await this.mediaService.generateVideo(params);
    });

    this.safeHandle("media:renderDiagram", async (_, params: any) => {
      return await this.mediaService.renderDiagram(params);
    });

    this.safeHandle("media:cancelJob", async (_, jobId: string) => {
      return await this.mediaService.cancelJob(jobId);
    });

    this.safeHandle("media:modelsStatus", async () => {
      return await this.mediaService.modelsStatus();
    });

    this.safeHandle("media:downloadModel", async (_, modelId: string) => {
      return await this.mediaService.downloadModel(modelId);
    });

    this.safeHandle("media:deleteModel", async (_, modelId: string) => {
      return await this.mediaService.deleteModel(modelId);
    });

    this.safeHandle("media:subscribeProgress", async (_, jobId: string) => {
      this.mediaService.subscribeProgress(jobId, (evt: any) => {
        this.windowManager.sendToMainWindow("media:progress", jobId, evt);
      });
      return { subscribed: true };
    });

    this.safeHandle("media:unsubscribeProgress", async (_, jobId: string) => {
      this.mediaService.unsubscribeProgress(jobId);
      return { unsubscribed: true };
    });
  }

  /**
   * LLM bootstrap handlers
   */
  private registerLLMHandlers(): void {
    this.safeHandle("llm:ensureReady", async (_, timeoutMs?: number) => {
      return await this.llmBootstrapService.ensureReady(timeoutMs || 60000);
    });

    this.safeHandle("llm:isRunning", async () => {
      // Try a quick health check
      const http = require("http");
      return new Promise((resolve) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port: 43121,
            path: "/health",
            method: "GET",
            timeout: 2000,
          },
          (res: any) => {
            resolve(res.statusCode === 200);
          },
        );

        req.on("error", () => [resolve(false)]);
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
    });
  }

  /**
   * Local modules bootstrap handlers
   */
  private registerBootstrapHandlers(): void {
    this.safeHandle("bootstrap:getStatus", async () => {
      return this.localModulesBootstrapService.getStatus();
    });

    this.safeHandle("bootstrap:retry", async () => {
      return await this.localModulesBootstrapService.retryBootstrap();
    });
  }

  /**
   * System handlers
   */
  private registerSystemHandlers(): void {
    this.safeHandle("system:getAppVersion", async () => {
      return app.getVersion();
    });

    this.safeHandle("system:getAppPath", async (_, name: string) => {
      return app.getPath(name as any);
    });

    this.safeHandle("system:openExternal", async (_, url: string) => {
      return await shell.openExternal(url);
    });

    this.safeHandle("system:showItemInFolder", async (_, path: string) => {
      return shell.showItemInFolder(path);
    });
  }

  /**
   * Window handlers
   */
  private registerWindowHandlers(): void {
    ipcMain.on("window:minimize", () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on("window:maximize", () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
      }
    });

    ipcMain.on("window:close", () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) mainWindow.close();
    });

    this.safeHandle("window:isMaximized", async () => {
      const mainWindow = this.windowManager.getMainWindow();
      return mainWindow ? mainWindow.isMaximized() : false;
    });
  }
}
