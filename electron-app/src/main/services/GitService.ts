/**
 * Git Service
 * Handles git operations using simple-git
 */

import simpleGit, { LogResult, SimpleGit, StatusResult } from "simple-git";
import { FileSystemService } from "./FileSystemService";

export class GitService {
  private git: SimpleGit | null = null;

  constructor(private fileSystemService?: FileSystemService) {}

  /**
   * Get git instance for current workspace
   */
  private getGit(): SimpleGit {
    if (!this.git) {
      const workspacePath = this.fileSystemService?.getWorkspacePath();
      if (!workspacePath) {
        throw new Error("No workspace open");
      }
      this.git = simpleGit(workspacePath);
    }
    return this.git;
  }

  /**
   * Get repository status
   */
  public async status(): Promise<StatusResult> {
    return await this.getGit().status();
  }

  /**
   * Get diff
   */
  public async diff(filepath?: string): Promise<string> {
    if (filepath) {
      return await this.getGit().diff([filepath]);
    }
    return await this.getGit().diff();
  }

  /**
   * Commit changes
   */
  public async commit(message: string, files?: string[]): Promise<void> {
    const git = this.getGit();

    if (files && files.length > 0) {
      await git.add(files);
    } else {
      await git.add(".");
    }

    await git.commit(message);
  }

  /**
   * List branches
   */
  public async branch(): Promise<string[]> {
    const result = await this.getGit().branch();
    return result.all;
  }

  /**
   * Checkout branch
   */
  public async checkout(branch: string): Promise<void> {
    await this.getGit().checkout(branch);
  }

  /**
   * Get commit log
   */
  public async log(count: number = 10): Promise<any[]> {
    const result: LogResult = await this.getGit().log({ maxCount: count });
    return [...result.all];
  }

  /**
   * Reset git instance (when workspace changes)
   */
  public reset(): void {
    this.git = null;
  }
}
