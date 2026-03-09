/**
 * CodIn Preload Script
 * Exposes safe IPC APIs to the renderer process
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

/**
 * File system operations
 */
const fileSystemAPI = {
  // File operations
  readFile: (filepath: string): Promise<string> =>
    ipcRenderer.invoke("fs:readFile", filepath),
  writeFile: (filepath: string, content: string): Promise<void> =>
    ipcRenderer.invoke("fs:writeFile", filepath, content),
  deleteFile: (filepath: string): Promise<void> =>
    ipcRenderer.invoke("fs:deleteFile", filepath),
  renameFile: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke("fs:renameFile", oldPath, newPath),

  // Directory operations
  readDir: (dirpath: string): Promise<string[]> =>
    ipcRenderer.invoke("fs:readDir", dirpath),
  createDir: (dirpath: string): Promise<void> =>
    ipcRenderer.invoke("fs:createDir", dirpath),
  deleteDir: (dirpath: string): Promise<void> =>
    ipcRenderer.invoke("fs:deleteDir", dirpath),

  // File info
  fileExists: (filepath: string): Promise<boolean> =>
    ipcRenderer.invoke("fs:fileExists", filepath),
  getFileStats: (filepath: string): Promise<any> =>
    ipcRenderer.invoke("fs:getFileStats", filepath),

  // Workspace
  openFolder: (): Promise<string | null> => ipcRenderer.invoke("fs:openFolder"),
  getWorkspacePath: (): Promise<string | null> =>
    ipcRenderer.invoke("fs:getWorkspacePath"),
  setWorkspacePath: (path: string): Promise<void> =>
    ipcRenderer.invoke("fs:setWorkspacePath", path),

  // Watch for changes
  watchFiles: (
    pattern: string,
    callback: (event: string, path: string) => void,
  ) => {
    const listener = (_: IpcRendererEvent, event: string, path: string) =>
      callback(event, path);
    ipcRenderer.on("fs:fileChanged", listener);
    ipcRenderer.send("fs:watch", pattern);
    return () => {
      ipcRenderer.removeListener("fs:fileChanged", listener);
      ipcRenderer.send("fs:unwatch", pattern);
    };
  },
};

/**
 * Git operations
 */
const gitAPI = {
  status: (): Promise<any> => ipcRenderer.invoke("git:status"),
  diff: (filepath?: string): Promise<string> =>
    ipcRenderer.invoke("git:diff", filepath),
  commit: (message: string, files?: string[]): Promise<void> =>
    ipcRenderer.invoke("git:commit", message, files),
  branch: (): Promise<string[]> => ipcRenderer.invoke("git:branch"),
  checkout: (branch: string): Promise<void> =>
    ipcRenderer.invoke("git:checkout", branch),
  log: (count?: number): Promise<any[]> => ipcRenderer.invoke("git:log", count),
};

/**
 * Terminal operations
 */
const terminalAPI = {
  create: (cwd?: string): Promise<string> =>
    ipcRenderer.invoke("terminal:create", cwd),
  write: (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke("terminal:write", id, data),
  resize: (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke("terminal:resize", id, cols, rows),
  kill: (id: string): Promise<void> => ipcRenderer.invoke("terminal:kill", id),

  onData: (id: string, callback: (data: string) => void) => {
    const listener = (_: IpcRendererEvent, termId: string, data: string) => {
      if (termId === id) callback(data);
    };
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },

  onExit: (id: string, callback: (code: number) => void) => {
    const listener = (_: IpcRendererEvent, termId: string, code: number) => {
      if (termId === id) callback(code);
    };
    ipcRenderer.on("terminal:exit", listener);
    return () => ipcRenderer.removeListener("terminal:exit", listener);
  },
};

/**
 * Model manager operations
 */
const modelManagerAPI = {
  listModels: (): Promise<any[]> => ipcRenderer.invoke("models:list"),
  downloadModel: (modelId: string): Promise<void> =>
    ipcRenderer.invoke("models:download", modelId),
  deleteModel: (modelId: string): Promise<void> =>
    ipcRenderer.invoke("models:delete", modelId),
  getModelInfo: (modelId: string): Promise<any> =>
    ipcRenderer.invoke("models:getInfo", modelId),
  setActiveModel: (modelId: string): Promise<void> =>
    ipcRenderer.invoke("models:setActive", modelId),
  getActiveModel: (): Promise<string | null> =>
    ipcRenderer.invoke("models:getActive"),

  onDownloadProgress: (callback: (progress: any) => void) => {
    const listener = (_: IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on("models:downloadProgress", listener);
    return () =>
      ipcRenderer.removeListener("models:downloadProgress", listener);
  },
};

/**
 * Agent/AI operations
 */
const agentAPI = {
  // Agent service
  isAgentRunning: (): Promise<boolean> => ipcRenderer.invoke("agent:isRunning"),
  startAgent: (): Promise<void> => ipcRenderer.invoke("agent:start"),
  stopAgent: (): Promise<void> => ipcRenderer.invoke("agent:stop"),

  // I18n operations
  translate: (
    text: string,
    fromLang: string,
    toLang: string,
  ): Promise<string> =>
    ipcRenderer.invoke("agent:translate", text, fromLang, toLang),
  detectLanguage: (text: string): Promise<string> =>
    ipcRenderer.invoke("agent:detectLanguage", text),
  getSupportedLanguages: (): Promise<any[]> =>
    ipcRenderer.invoke("agent:getSupportedLanguages"),

  // Voice operations
  speechToText: (audioData: ArrayBuffer, language: string): Promise<string> =>
    ipcRenderer.invoke("agent:speechToText", audioData, language),
  textToSpeech: (text: string, language: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke("agent:textToSpeech", text, language),

  // LLM inference (local)
  generateCompletion: (prompt: string, options?: any): Promise<string> =>
    ipcRenderer.invoke("agent:generateCompletion", prompt, options),
  streamCompletion: (prompt: string, options?: any): Promise<string> =>
    ipcRenderer.invoke("agent:streamCompletion", prompt, options),

  onStreamChunk: (callback: (chunk: string) => void) => {
    const listener = (_: IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on("agent:streamChunk", listener);
    return () => ipcRenderer.removeListener("agent:streamChunk", listener);
  },
};

/**
 * Compute operations
 */
const computeAPI = {
  submitJob: (payload: any): Promise<any> =>
    ipcRenderer.invoke("compute:submitJob", payload),
  listJobs: (filters?: any): Promise<any> =>
    ipcRenderer.invoke("compute:listJobs", filters),
  getJob: (jobId: string): Promise<any> =>
    ipcRenderer.invoke("compute:getJob", jobId),
  deleteJob: (jobId: string): Promise<any> =>
    ipcRenderer.invoke("compute:deleteJob", jobId),
  cancelJob: (jobId: string): Promise<any> =>
    ipcRenderer.invoke("compute:cancelJob", jobId),
  pauseJob: (jobId: string): Promise<any> =>
    ipcRenderer.invoke("compute:pauseJob", jobId),
  resumeJob: (jobId: string): Promise<any> =>
    ipcRenderer.invoke("compute:resumeJob", jobId),
  getStats: (): Promise<any> => ipcRenderer.invoke("compute:getStats"),
  listLanguages: (): Promise<any> =>
    ipcRenderer.invoke("compute:listLanguages"),
  runWorkflow: (name: string, body?: any): Promise<any> =>
    ipcRenderer.invoke("compute:runWorkflow", name, body),

  subscribeToJobEvents: (
    jobId: string,
    callback: (event: string, data: any) => void,
  ) => {
    const listener = (
      _: IpcRendererEvent,
      eventJobId: string,
      event: string,
      data: any,
    ) => {
      if (eventJobId === jobId) {
        callback(event, data);
      }
    };
    ipcRenderer.on("compute:event", listener);
    ipcRenderer.invoke("compute:subscribe", jobId).catch((err: any) => {
      console.error(`[compute] subscribe to ${jobId} failed:`, err);
    });
    return () => {
      ipcRenderer.invoke("compute:unsubscribe", jobId).catch(() => {});
      ipcRenderer.removeListener("compute:event", listener);
    };
  },
};

/**
 * System operations
 */
const systemAPI = {
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke("system:getAppVersion"),
  getPlatform: (): string => process.platform,
  getAppPath: (name: string): Promise<string> =>
    ipcRenderer.invoke("system:getAppPath", name),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("system:openExternal", url),
  showItemInFolder: (path: string): Promise<void> =>
    ipcRenderer.invoke("system:showItemInFolder", path),
};

/**
 * Bootstrap operations
 */
const bootstrapAPI = {
  getStatus: (): Promise<any> => ipcRenderer.invoke("bootstrap:getStatus"),
  retry: (): Promise<any> => ipcRenderer.invoke("bootstrap:retry"),
};

/**
 * Window operations
 */
const windowAPI = {
  minimize: (): void => ipcRenderer.send("window:minimize"),
  maximize: (): void => ipcRenderer.send("window:maximize"),
  close: (): void => ipcRenderer.send("window:close"),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:isMaximized"),

  onMaximized: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },

  onUnmaximized: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("window:unmaximized", listener);
    return () => ipcRenderer.removeListener("window:unmaximized", listener);
  },
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld("codinAPI", {
  fs: fileSystemAPI,
  git: gitAPI,
  terminal: terminalAPI,
  models: modelManagerAPI,
  agent: agentAPI,
  compute: computeAPI,
  system: systemAPI,
  bootstrap: bootstrapAPI,
  window: windowAPI,
});

/**
 * VS Code webview API shim for Electron
 * The GUI was built for VS Code webview and uses vscode.postMessage().
 * This shim bridges those calls to Electron IPC so the same GUI works standalone.
 */
const vscodeShim = {
  postMessage(message: any) {
    ipcRenderer.send("webview:message", message);
    return vscodeShim;
  },
  getState() {
    return {};
  },
  setState(_state: any) {
    // no-op in Electron
  },
};

// Expose acquireVsCodeApi and the vscode global
contextBridge.exposeInMainWorld("acquireVsCodeApi", () => vscodeShim);
contextBridge.exposeInMainWorld("vscode", vscodeShim);

// Forward messages from main process → window.postMessage (same as VS Code webview)
ipcRenderer.on("webview:message", (_event: IpcRendererEvent, message: any) => {
  window.postMessage(message, "*");
});

// Type definitions for TypeScript
export interface CodInAPI {
  fs: typeof fileSystemAPI;
  git: typeof gitAPI;
  terminal: typeof terminalAPI;
  models: typeof modelManagerAPI;
  agent: typeof agentAPI;
  compute: typeof computeAPI;
  system: typeof systemAPI;
  bootstrap: typeof bootstrapAPI;
  window: typeof windowAPI;
}

declare global {
  interface Window {
    codinAPI: CodInAPI;
  }
}
