/**
 * Global type declarations for the CodIn API bridge
 * exposed to the webview by the host (VS Code extension / Electron shell).
 *
 * Must stay in sync with electron-app/src/preload/preload.ts
 */

/* ── File System ─────────────────────────────────────────── */
interface CodinFsAPI {
  readFile(filepath: string): Promise<string>;
  writeFile(filepath: string, content: string): Promise<void>;
  deleteFile(filepath: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  readDir(dirpath: string): Promise<string[]>;
  createDir(dirpath: string): Promise<void>;
  deleteDir(dirpath: string): Promise<void>;
  fileExists(filepath: string): Promise<boolean>;
  getFileStats(filepath: string): Promise<any>;
  openFolder(): Promise<string | null>;
  getWorkspacePath(): Promise<string | null>;
  setWorkspacePath(path: string): Promise<void>;
  watchFiles(
    pattern: string,
    callback: (event: string, path: string) => void,
  ): () => void;
}

/* ── Git ──────────────────────────────────────────────────── */
interface CodinGitAPI {
  status(): Promise<any>;
  diff(filepath?: string): Promise<string>;
  commit(message: string, files?: string[]): Promise<void>;
  branch(): Promise<string[]>;
  checkout(branch: string): Promise<void>;
  log(count?: number): Promise<any[]>;
}

/* ── Terminal ─────────────────────────────────────────────── */
interface CodinTerminalAPI {
  create(cwd?: string): Promise<string>;
  write(id: string, data: string): Promise<void>;
  resize(id: string, cols: number, rows: number): Promise<void>;
  kill(id: string): Promise<void>;
  onData(id: string, callback: (data: string) => void): () => void;
  onExit(id: string, callback: (code: number) => void): () => void;
}

/* ── Model Manager ────────────────────────────────────────── */
interface CodinModelsAPI {
  listModels(): Promise<any[]>;
  downloadModel(modelId: string): Promise<void>;
  deleteModel(modelId: string): Promise<void>;
  getModelInfo(modelId: string): Promise<any>;
  setActiveModel(modelId: string): Promise<void>;
  getActiveModel(): Promise<string | null>;
  onDownloadProgress(callback: (progress: any) => void): () => void;
}

/* ── Agent / AI ───────────────────────────────────────────── */
interface CodinAgentAPI {
  isAgentRunning(): Promise<boolean>;
  startAgent(): Promise<void>;
  stopAgent(): Promise<void>;
  translate(text: string, fromLang: string, toLang: string): Promise<string>;
  detectLanguage(text: string): Promise<string>;
  getSupportedLanguages(): Promise<any[]>;
  speechToText(audioData: ArrayBuffer, language: string): Promise<string>;
  textToSpeech(text: string, language: string): Promise<ArrayBuffer>;
  generateCompletion(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<string>;
  streamCompletion(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<string>;
  onStreamChunk(callback: (chunk: string) => void): () => void;
}

/* ── Compute (local-only) ─────────────────────────────────── */
interface CodinComputeAPI {
  submitJob(payload: any): Promise<any>;
  listJobs(filters?: any): Promise<any>;
  getJob(jobId: string): Promise<any>;
  deleteJob(jobId: string): Promise<any>;
  cancelJob(jobId: string): Promise<any>;
  pauseJob(jobId: string): Promise<any>;
  resumeJob(jobId: string): Promise<any>;
  getStats(): Promise<any>;
  listLanguages(): Promise<any>;
  runWorkflow(name: string, body?: any): Promise<any>;
  subscribeToJobEvents(
    jobId: string,
    callback: (event: string, data: any) => void,
  ): () => void;
}

/* ── System ────────────────────────────────────────────────── */
interface CodinSystemAPI {
  getAppVersion(): Promise<string>;
  getPlatform(): string;
  getAppPath(name: string): Promise<string>;
  openExternal(url: string): Promise<void>;
  showItemInFolder(path: string): Promise<void>;
}

/* ── Bootstrap ───────────────────────────────────────────── */
interface CodinBootstrapAPI {
  getStatus(): Promise<any>;
  retry(): Promise<any>;
}

/* ── Window ────────────────────────────────────────────────── */
interface CodinWindowAPI {
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onMaximized(callback: () => void): () => void;
  onUnmaximized(callback: () => void): () => void;
}

/* ── Root API ──────────────────────────────────────────────── */
interface CodinAPI {
  fs: CodinFsAPI;
  git: CodinGitAPI;
  terminal: CodinTerminalAPI;
  models: CodinModelsAPI;
  agent: CodinAgentAPI;
  compute: CodinComputeAPI;
  system: CodinSystemAPI;
  bootstrap: CodinBootstrapAPI;
  window: CodinWindowAPI;
}

declare global {
  interface Window {
    codinAPI: CodinAPI;
  }
}

export {};
