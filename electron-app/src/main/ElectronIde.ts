/**
 * ElectronIde - Electron Implementation of IDE Interface
 *
 * This replaces VsCodeIde.ts and provides the same IDE abstractions
 * but implemented using Electron/Node.js APIs instead of VS Code APIs.
 *
 * This is the adapter between the core protocol system and Electron's native APIs.
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Minimal IDE interface matching core/index.d.ts shape.
 * Defined locally to avoid cross-project TS source imports.
 */
interface IDE {
  getWorkspaceDirectory(): Promise<string | undefined>;
  listWorkspaceDirectories(): Promise<string[]>;
  readFile(filepath: string): Promise<string>;
  writeFile(filepath: string, content: string): Promise<void>;
  readRangeInFile(filepath: string, range: any): Promise<string>;
  [key: string]: any;
}

interface IDEUtils {
  getLanguageForFile(filepath: string): string;
}

export class ElectronIde implements IDE {
  private workspacePath: string | null = null;

  constructor(workspacePath?: string) {
    if (workspacePath) {
      this.workspacePath = workspacePath;
    }
  }

  /**
   * Set workspace path
   */
  public setWorkspacePath(path: string): void {
    this.workspacePath = path;
  }

  /**
   * Get workspace directory
   */
  async getWorkspaceDirectory(): Promise<string | undefined> {
    return this.workspacePath || undefined;
  }

  /**
   * List workspace directories
   */
  async listWorkspaceDirectories(): Promise<string[]> {
    if (!this.workspacePath) {
      return [];
    }
    return [this.workspacePath];
  }

  /**
   * Get workspace configuration
   */
  async getWorkspaceConfig(): Promise<any> {
    // TODO: Load from .codin/config.json
    return {};
  }

  /**
   * Read file
   */
  async readFile(filepath: string): Promise<string> {
    const fullPath = this.resolvePath(filepath);
    return await fs.readFile(fullPath, "utf-8");
  }

  /**
   * Write file
   */
  async writeFile(filepath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filepath);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, "utf-8");
  }

  /**
   * Read range from file
   */
  async readRangeInFile(filepath: string, range: any): Promise<string> {
    const content = await this.readFile(filepath);
    const lines = content.split("\n");
    const selectedLines = lines.slice(range.start.line, range.end.line + 1);
    return selectedLines.join("\n");
  }

  /**
   * Get file stats
   */
  async fileExists(filepath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(filepath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List directory contents
   */
  async listDir(dirpath: string): Promise<[string, number][]> {
    const fullPath = this.resolvePath(dirpath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    return entries.map((entry) => {
      const name = entry.name;
      const type = entry.isDirectory() ? 2 : 1; // 2 = directory, 1 = file
      return [name, type] as [string, number];
    });
  }

  /**
   * Show diff between two texts
   */
  async showDiff(
    filepath: string,
    oldContent: string,
    newContent: string,
    stepIndex: number,
  ): Promise<void> {
    // In Electron, we'll send this to the renderer to display in Monaco
    // For now, just log it
    console.log(`Showing diff for ${filepath} at step ${stepIndex}`);
  }

  /**
   * Get git root
   */
  async getGitRoot(): Promise<string | undefined> {
    if (!this.workspacePath) {
      return undefined;
    }

    try {
      let currentDir = this.workspacePath;

      while (currentDir !== path.dirname(currentDir)) {
        const gitDir = path.join(currentDir, ".git");
        if (await this.fileExists(gitDir)) {
          return currentDir;
        }
        currentDir = path.dirname(currentDir);
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get branches
   */
  async getBranch(dir: string): Promise<string> {
    // This will be delegated to GitService
    return "main";
  }

  /**
   * Get open files
   */
  async getOpenFiles(): Promise<string[]> {
    // In Electron, we'll track this in the renderer
    return [];
  }

  /**
   * Get visible files (currently in editor)
   */
  async getVisibleFiles(): Promise<string[]> {
    // In Electron, we'll track this in the renderer
    return [];
  }

  /**
   * Get terminal contents
   */
  async getTerminalContents(): Promise<string> {
    // Terminal contents will be managed by TerminalService
    return "";
  }

  /**
   * Run command in terminal
   */
  async runCommand(command: string): Promise<void> {
    console.log(`Running command: ${command}`);
    // This will be delegated to TerminalService
  }

  /**
   * Show message to user
   */
  async showMessage(
    message: string,
    messageType?: "info" | "warning" | "error",
  ): Promise<void> {
    console.log(`[${messageType || "info"}] ${message}`);
    // In Electron, we'll send this to renderer to show as notification
  }

  /**
   * Show virtual file (e.g., for previews)
   */
  async showVirtualFile(name: string, content: string): Promise<void> {
    console.log(`Showing virtual file: ${name}`);
    // In Electron, we'll send this to renderer to open in Monaco
  }

  /**
   * Get selected text in editor
   */
  async getSelectedText(): Promise<string> {
    // This will come from the Monaco editor in renderer
    return "";
  }

  /**
   * Get currently open file
   */
  async getCurrentFile(): Promise<string | undefined> {
    // This will be tracked in renderer
    return undefined;
  }

  /**
   * Get IDE settings
   */
  async getIdeSettings(): Promise<any> {
    // TODO: Load from user config
    return {
      remoteConfigServerUrl: null,
      remoteConfigSyncPeriod: 60,
    };
  }

  /**
   * Get IDE info
   */
  async getIdeInfo(): Promise<any> {
    return {
      ideType: "electron",
      name: "CodIn",
      version: "1.0.0",
      remoteName: null,
      extensionVersion: "1.0.0",
    };
  }

  /**
   * Get unique IDE identifier
   */
  async getUniqueId(): Promise<string> {
    // Generate or load from config
    return "electron-" + Date.now();
  }

  /**
   * Get OS/platform info
   */
  async getOsInfo(): Promise<any> {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
    };
  }

  /**
   * Get available models (local LLMs)
   */
  async getAvailableModels(): Promise<string[]> {
    // This will be delegated to ModelManagerService
    return [];
  }

  /**
   * Get model info
   */
  async getModelInfo(modelId: string): Promise<any> {
    // This will be delegated to ModelManagerService
    return null;
  }

  /**
   * Open file in editor
   */
  async openFile(filepath: string): Promise<void> {
    console.log(`Opening file: ${filepath}`);
    // Send to renderer to open in Monaco
  }

  /**
   * Highlight code in editor
   */
  async highlightCode(
    filepath: string,
    range: any,
    color: string,
  ): Promise<void> {
    console.log(`Highlighting code in ${filepath}`);
    // Send to renderer for Monaco decoration
  }

  /**
   * Show quick pick dialog
   */
  async showQuickPick(
    items: string[],
    title?: string,
  ): Promise<string | undefined> {
    // In Electron, we'll show a custom dialog in renderer
    return undefined;
  }

  /**
   * Show input box
   */
  async showInputBox(
    title: string,
    defaultValue?: string,
  ): Promise<string | undefined> {
    // In Electron, we'll show a custom dialog in renderer
    return undefined;
  }

  /**
   * Show yes/no confirmation
   */
  async showYesNo(message: string): Promise<boolean> {
    // In Electron, we'll show a custom dialog in renderer
    return false;
  }

  /**
   * Path helpers
   */
  pathSep(): string {
    return path.sep;
  }

  async getAbsolutePath(filepath: string): Promise<string> {
    if (path.isAbsolute(filepath)) {
      return filepath;
    }

    if (this.workspacePath) {
      return path.join(this.workspacePath, filepath);
    }

    return filepath;
  }

  /**
   * Get relavant context for file
   */
  async getRelevantContext(
    filepath: string,
    query: string,
    n: number,
  ): Promise<string[]> {
    // This will use the indexing system from core
    return [];
  }

  /**
   * Resolve path relative to workspace
   */
  private resolvePath(filepath: string): string {
    if (path.isAbsolute(filepath)) {
      return filepath;
    }

    if (this.workspacePath) {
      return path.join(this.workspacePath, filepath);
    }

    return filepath;
  }
}

/**
 * IDE Utilities for Electron
 */
export class ElectronIdeUtils implements IDEUtils {
  getLanguageForFile(filepath: string): string {
    const ext = path.extname(filepath).toLowerCase();

    const languageMap: { [key: string]: string } = {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact",
      ".py": "python",
      ".java": "java",
      ".c": "c",
      ".cpp": "cpp",
      ".h": "c",
      ".hpp": "cpp",
      ".cs": "csharp",
      ".go": "go",
      ".rs": "rust",
      ".rb": "ruby",
      ".php": "php",
      ".swift": "swift",
      ".kt": "kotlin",
      ".scala": "scala",
      ".r": "r",
      ".m": "objective-c",
      ".sql": "sql",
      ".json": "json",
      ".xml": "xml",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".sass": "sass",
      ".md": "markdown",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".toml": "toml",
      ".sh": "shellscript",
      ".bash": "shellscript",
      ".ps1": "powershell",
      ".bat": "bat",
      ".cmd": "bat",
    };

    return languageMap[ext] || "plaintext";
  }
}
