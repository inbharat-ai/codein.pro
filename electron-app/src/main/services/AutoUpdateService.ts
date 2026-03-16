/**
 * Auto-update service using electron-updater
 * Checks for updates on launch and notifies the renderer
 */
import { autoUpdater, UpdateInfo } from "electron-updater";
import { BrowserWindow } from "electron";

export class AutoUpdateService {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupListeners();
  }

  private setupListeners(): void {
    autoUpdater.on("update-available", (info: UpdateInfo) => {
      this.sendToRenderer("update-available", {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on("update-not-available", () => {
      this.sendToRenderer("update-not-available", {});
    });

    autoUpdater.on("download-progress", (progress) => {
      this.sendToRenderer("update-download-progress", {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      this.sendToRenderer("update-downloaded", {
        version: info.version,
      });
    });

    autoUpdater.on("error", (error) => {
      this.sendToRenderer("update-error", {
        message: error.message,
      });
    });
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      // Silent fail — no internet or no published releases yet
      console.warn("[AutoUpdate] Check failed:", error);
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  private sendToRenderer(channel: string, data: Record<string, unknown>): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
