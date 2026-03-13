/**
 * Window Manager
 * Manages application windows and their state
 */

import { BrowserWindow, screen, session } from "electron";
import Store from "electron-store";
import * as path from "path";

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private store: Store;

  constructor() {
    this.store = new Store<Record<string, unknown>>({
      name: "window-state",
      defaults: {
        width: 1200,
        height: 800,
        isMaximized: false,
      },
    });
  }

  /**
   * Create the main application window
   */
  public async createMainWindow(): Promise<BrowserWindow> {
    // Get saved window state
    const windowState = this.getWindowState();

    // Create browser window
    this.mainWindow = new BrowserWindow({
      width: windowState.width,
      height: windowState.height,
      x: windowState.x,
      y: windowState.y,
      minWidth: 800,
      minHeight: 600,
      show: false, // Show after ready-to-show to prevent flicker
      backgroundColor: "#1e1e1e",
      title: "CodIn",
      icon: this.getIcon(),
      webPreferences: {
        preload: path.join(__dirname, "..", "preload", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // Needed for node-pty
        webSecurity: true,
      },
    });

    // Restore maximized state
    if (windowState.isMaximized) {
      this.mainWindow.maximize();
    }

    // Load the GUI
    await this.loadGUI();

    // Show window when ready
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });

    // Setup CSP headers
    this.setupCSP();

    // Setup window event handlers
    this.setupWindowHandlers();

    return this.mainWindow;
  }

  /**
   * Load the GUI (development vs production)
   */
  private async loadGUI(): Promise<void> {
    if (!this.mainWindow) return;

    const { app } = require("electron");

    // In development, load from Vite dev server
    if (process.env.NODE_ENV === "development" || !app.isPackaged) {
      const guiUrl = "http://localhost:5173";
      try {
        await this.mainWindow.loadURL(guiUrl);
        this.mainWindow.webContents.openDevTools();
      } catch {
        // Vite not running — try loading built files from workspace
        const devGuiPath = path.join(
          __dirname,
          "..",
          "..",
          "..",
          "gui",
          "dist",
          "index.html",
        );
        await this.mainWindow.loadFile(devGuiPath);
      }
    } else {
      // In production, load from extra resources
      const guiPath = path.join(process.resourcesPath, "gui", "index.html");
      await this.mainWindow.loadFile(guiPath);
    }
  }

  /**
   * Get saved window state or defaults
   */
  private getWindowState(): WindowState {
    const width = this.store.get("width") as number;
    const height = this.store.get("height") as number;
    const x = this.store.get("x") as number | undefined;
    const y = this.store.get("y") as number | undefined;
    const isMaximized = this.store.get("isMaximized") as boolean;

    // Validate that window is within screen bounds
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } =
      primaryDisplay.workAreaSize;

    const validWidth = Math.min(width, screenWidth);
    const validHeight = Math.min(height, screenHeight);

    return {
      width: validWidth,
      height: validHeight,
      x: x !== undefined && x >= 0 && x < screenWidth ? x : undefined,
      y: y !== undefined && y >= 0 && y < screenHeight ? y : undefined,
      isMaximized,
    };
  }

  /**
   * Save window state
   */
  private saveWindowState(): void {
    if (!this.mainWindow) return;

    const bounds = this.mainWindow.getBounds();
    const isMaximized = this.mainWindow.isMaximized();

    this.store.set({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    });
  }

  /**
   * Setup Content-Security-Policy headers to mitigate XSS and code injection
   */
  private setupCSP(): void {
    const ses = this.mainWindow?.webContents.session;
    if (!ses) return;

    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' http://localhost:* https://*.openai.com https://*.anthropic.com https://*.deepseek.com https://*.ai4bharat.org ws://localhost:*",
              "worker-src 'self' blob:",
              "frame-src 'none'",
            ].join("; "),
          ],
        },
      });
    });
  }

  /**
   * Setup window event handlers
   */
  private setupWindowHandlers(): void {
    if (!this.mainWindow) return;

    // Save state when window is resized or moved
    this.mainWindow.on("resize", () => {
      if (!this.mainWindow?.isMaximized()) {
        this.saveWindowState();
      }
    });

    this.mainWindow.on("move", () => {
      if (!this.mainWindow?.isMaximized()) {
        this.saveWindowState();
      }
    });

    this.mainWindow.on("maximize", () => {
      this.store.set("isMaximized", true);
      this.sendToMainWindow("window:maximized");
    });

    this.mainWindow.on("unmaximize", () => {
      this.store.set("isMaximized", false);
      this.sendToMainWindow("window:unmaximized");
      this.saveWindowState();
    });

    // Clean up on close
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });
  }

  /**
   * Get application icon path
   */
  private getIcon(): string {
    const { app } = require("electron");
    const iconName = process.platform === "win32" ? "icon.ico" : "icon.png";
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "build", iconName);
    }
    // __dirname = electron-app/dist/main/ → 2 levels up to electron-app/build/
    return path.join(__dirname, "..", "..", "build", iconName);
  }

  /**
   * Focus the main window
   */
  public focusMainWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
    }
  }

  /**
   * Get the main window instance
   */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Send message to main window
   */
  public sendToMainWindow(channel: string, ...args: any[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}
