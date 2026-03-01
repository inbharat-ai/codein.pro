/**
 * File System Service
 * Handles all file system operations
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as chokidar from "chokidar";
import Store from "electron-store";

export class FileSystemService {
  private workspacePath: string | null = null;
  private store: Store;
  private watchers: Map<string, chokidar.FSWatcher> = new Map();

  constructor() {
    this.store = new Store({
      name: "workspace",
    });

    // Load last workspace path
    this.workspacePath = this.store.get("path") as string | null;
  }

  /**
   * Read file contents
   */
  public async readFile(filepath: string): Promise<string> {
    const fullPath = this.resolvePath(filepath);
    return await fs.readFile(fullPath, "utf-8");
  }

  /**
   * Write file contents
   */
  public async writeFile(filepath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filepath);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, "utf-8");
  }

  /**
   * Delete file
   */
  public async deleteFile(filepath: string): Promise<void> {
    const fullPath = this.resolvePath(filepath);
    await fs.unlink(fullPath);
  }

  /**
   * Rename/move file
   */
  public async renameFile(oldPath: string, newPath: string): Promise<void> {
    const fullOldPath = this.resolvePath(oldPath);
    const fullNewPath = this.resolvePath(newPath);

    // Ensure target directory exists
    const dir = path.dirname(fullNewPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.rename(fullOldPath, fullNewPath);
  }

  /**
   * Read directory contents
   */
  public async readDir(dirpath: string): Promise<string[]> {
    const fullPath = this.resolvePath(dirpath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    return entries.map((entry) => {
      const name = entry.name;
      return entry.isDirectory() ? name + "/" : name;
    });
  }

  /**
   * Create directory
   */
  public async createDir(dirpath: string): Promise<void> {
    const fullPath = this.resolvePath(dirpath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  /**
   * Delete directory
   */
  public async deleteDir(dirpath: string): Promise<void> {
    const fullPath = this.resolvePath(dirpath);
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  /**
   * Check if file exists
   */
  public async fileExists(filepath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(filepath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  public async getFileStats(filepath: string): Promise<any> {
    const fullPath = this.resolvePath(filepath);
    const stats = await fs.stat(fullPath);

    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      modified: stats.mtime.getTime(),
      created: stats.birthtime.getTime(),
    };
  }

  /**
   * Get workspace path
   */
  public getWorkspacePath(): string | null {
    return this.workspacePath;
  }

  /**
   * Set workspace path
   */
  public async setWorkspacePath(path: string): Promise<void> {
    this.workspacePath = path;
    this.store.set("path", path);
  }

  /**
   * Watch files for changes
   */
  public watchFiles(
    pattern: string,
    callback: (event: string, path: string) => void,
  ): void {
    if (this.watchers.has(pattern)) {
      return; // Already watching
    }

    const watchPath = this.workspacePath
      ? path.join(this.workspacePath, pattern)
      : pattern;

    const watcher = chokidar.watch(watchPath, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });

    watcher
      .on("add", (path) => callback("add", path))
      .on("change", (path) => callback("change", path))
      .on("unlink", (path) => callback("unlink", path))
      .on("addDir", (path) => callback("addDir", path))
      .on("unlinkDir", (path) => callback("unlinkDir", path));

    this.watchers.set(pattern, watcher);
  }

  /**
   * Stop watching files
   */
  public unwatchFiles(pattern: string): void {
    const watcher = this.watchers.get(pattern);
    if (watcher) {
      watcher.close();
      this.watchers.delete(pattern);
    }
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
