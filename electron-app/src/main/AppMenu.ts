/**
 * CodIn Application Menu
 * Full native menu bar with working shortcuts
 */

import { app, BrowserWindow, dialog, Menu, shell } from "electron";

export function buildAppMenu(windowManager: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    // ── File ──
    {
      label: "File",
      submenu: [
        {
          label: "Open Folder…",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const win = windowManager.getMainWindow();
            if (!win) return;
            const result = await dialog.showOpenDialog(win, {
              properties: ["openDirectory"],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              win.webContents.send("webview:message", {
                messageType: "openFolder",
                data: { path: result.filePaths[0] },
              });
            }
          },
        },
        {
          label: "Open File…",
          accelerator: "CmdOrCtrl+Shift+O",
          click: async () => {
            const win = windowManager.getMainWindow();
            if (!win) return;
            const result = await dialog.showOpenDialog(win, {
              properties: ["openFile"],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              win.webContents.send("webview:message", {
                messageType: "openFile",
                data: { path: result.filePaths[0] },
              });
            }
          },
        },
        { type: "separator" },
        {
          label: "New Chat Session",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            const win = windowManager.getMainWindow();
            win?.webContents.send("webview:message", {
              messageType: "newSession",
              data: {},
            });
          },
        },
        { type: "separator" },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            const win = windowManager.getMainWindow();
            win?.webContents.send("webview:message", {
              messageType: "navigateTo",
              data: { path: "/settings" },
            });
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },

    // ── Edit ──
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find",
          accelerator: "CmdOrCtrl+F",
          click: () => {
            const win = windowManager.getMainWindow();
            win?.webContents.send("webview:message", {
              messageType: "find",
              data: {},
            });
          },
        },
      ],
    },

    // ── View ──
    {
      label: "View",
      submenu: [
        {
          label: "Chat",
          accelerator: "CmdOrCtrl+1",
          click: () => {
            const win = windowManager.getMainWindow();
            win?.webContents.send("webview:message", {
              messageType: "navigateTo",
              data: { path: "/" },
            });
          },
        },
        {
          label: "History",
          accelerator: "CmdOrCtrl+H",
          click: () => {
            const win = windowManager.getMainWindow();
            win?.webContents.send("webview:message", {
              messageType: "navigateTo",
              data: { path: "/history" },
            });
          },
        },
        {
          label: "GPU Panel",
          accelerator: "CmdOrCtrl+G",
          click: () => {
            const win = windowManager.getMainWindow();
            win?.webContents.send("webview:message", {
              messageType: "navigateTo",
              data: { path: "/gpu" },
            });
          },
        },
        {
          label: "Compute",
          click: () => {
            const win = windowManager.getMainWindow();
            win?.webContents.send("webview:message", {
              messageType: "navigateTo",
              data: { path: "/compute" },
            });
          },
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

    // ── Window ──
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },

    // ── Help ──
    {
      label: "Help",
      submenu: [
        {
          label: "CodIn Documentation",
          click: () => shell.openExternal("https://codin.pro/docs"),
        },
        {
          label: "Report Issue",
          click: () =>
            shell.openExternal(
              "https://github.com/inbharat-ai/codein.pro/issues",
            ),
        },
        { type: "separator" },
        {
          label: `About CodIn v${app.getVersion()}`,
          click: () => {
            const win = windowManager.getMainWindow();
            if (win) {
              dialog.showMessageBox(win, {
                type: "info",
                title: "About CodIn",
                message: `CodIn v${app.getVersion()}`,
                detail:
                  "Multilingual AI-Powered Code Editor\nBuilt for Bharat\n\n© 2026 InBharat AI",
              });
            }
          },
        },
      ],
    },
  ];

  // macOS: Prepend app menu
  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
