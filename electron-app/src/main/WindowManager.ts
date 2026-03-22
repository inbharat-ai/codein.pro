/**
 * Window Manager
 * Manages application windows and their state
 */

import { BrowserWindow, screen, session } from "electron";
import * as fs from "fs";
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
  private store: Store | null = null;

  constructor() {
    try {
      this.store = new Store<Record<string, unknown>>({
        name: "window-state",
        defaults: {
          width: 1200,
          height: 800,
          isMaximized: false,
        },
      });
    } catch (err) {
      console.warn(
        "CodeIn: Failed to load window-state store, using defaults:",
        err,
      );
      this.store = null;
    }
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
      title: "CodeIn",
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

    // Register ready-to-show BEFORE loadGUI to avoid race condition:
    // loadFile() can resolve and fire ready-to-show before we attach the listener.
    let shown = false;
    this.mainWindow.once("ready-to-show", () => {
      if (!shown) {
        shown = true;
        this.mainWindow?.show();
        this.mainWindow?.focus();
      }
    });

    // Fallback: force-show after 10s if ready-to-show never fires (page load error)
    setTimeout(() => {
      if (!shown && this.mainWindow && !this.mainWindow.isDestroyed()) {
        shown = true;
        console.warn(
          "CodeIn: ready-to-show did not fire within 10s, force-showing window",
        );
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    }, 10000);

    // Load the GUI
    await this.loadGUI();

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

    // In development, try Vite dev server or fall back to built GUI files
    if (process.env.NODE_ENV === "development" || !app.isPackaged) {
      const guiUrl = "http://localhost:5173";
      // Guard against accidentally loading an unrelated app running on port 5173.
      // To use live Vite UI, set CODEIN_USE_VITE_DEV_SERVER=1.
      const useViteDevServer = process.env.CODEIN_USE_VITE_DEV_SERVER === "1";
      const viteRunning = useViteDevServer
        ? await this.isPortOpen(5173)
        : false;

      if (viteRunning) {
        await this.mainWindow.loadURL(guiUrl);
        this.mainWindow.webContents.openDevTools();
      } else {
        // Vite not running — load pre-built GUI files from workspace
        const devGuiPath = path.join(
          __dirname,
          "..",
          "..",
          "..",
          "gui",
          "dist",
          "index.html",
        );
        if (!fs.existsSync(devGuiPath)) {
          throw new Error(
            `GUI not found at ${devGuiPath}. Run 'npm run build' in gui/ first, or start the Vite dev server.`,
          );
        }
        await this.mainWindow.loadFile(devGuiPath);
      }
    } else {
      // In production, load from extra resources
      const guiPath = path.join(process.resourcesPath, "gui", "index.html");
      if (!fs.existsSync(guiPath)) {
        throw new Error(
          `Packaged GUI not found at ${guiPath}. The installer may be incomplete. Please reinstall from the latest release.`,
        );
      }
      await this.mainWindow.loadFile(guiPath);
    }
  }

  /**
   * Get saved window state or defaults
   */
  private getWindowState(): WindowState {
    const width = (this.store?.get("width") as number) ?? 1200;
    const height = (this.store?.get("height") as number) ?? 800;
    const x = this.store?.get("x") as number | undefined;
    const y = this.store?.get("y") as number | undefined;
    const isMaximized = (this.store?.get("isMaximized") as boolean) ?? false;

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
    if (!this.mainWindow || !this.store) return;

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
      this.store?.set("isMaximized", true);
      this.sendToMainWindow("window:maximized");
    });

    this.mainWindow.on("unmaximize", () => {
      this.store?.set("isMaximized", false);
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

  /**
   * Check if a TCP port is open on localhost (used to detect Vite dev server).
   * Returns within 500ms.
   */
  private isPortOpen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require("net") as typeof import("net");
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.setTimeout(500);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  }
}
