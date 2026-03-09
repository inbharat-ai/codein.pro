"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const SAFE_BRANCH = /^[A-Za-z0-9._/-]{1,128}$/;
const SAFE_REPO_NAME = /^[A-Za-z0-9._-]{1,120}$/;

class GitRepoService {
  constructor(opts = {}) {
    this.baseDir = path.resolve(
      opts.baseDir || path.join(process.cwd(), "repos"),
    );
    this.timeoutMs = opts.timeoutMs || 120000;
  }

  async ensureBaseDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  _validateRepoUrl(repoUrl) {
    if (!repoUrl || typeof repoUrl !== "string") {
      throw new Error("repoUrl is required");
    }
    const trimmed = repoUrl.trim();
    const isHttps = /^https:\/\/[^\s]+$/i.test(trimmed);
    const isSsh = /^git@[^\s:]+:[^\s]+$/i.test(trimmed);
    if (!isHttps && !isSsh) {
      throw new Error("Only HTTPS and SSH git URLs are allowed");
    }
    return trimmed;
  }

  _safeRepoName(name) {
    if (!name || typeof name !== "string") {
      throw new Error("Repository name is required");
    }
    if (!SAFE_REPO_NAME.test(name)) {
      throw new Error("Invalid repository name");
    }
    return name;
  }

  _resolveManagedRepo(repoPath) {
    const resolved = path.resolve(repoPath || "");
    if (
      !resolved.startsWith(this.baseDir + path.sep) &&
      resolved !== this.baseDir
    ) {
      throw new Error("Repository path must be inside managed base directory");
    }
    if (!existsSync(path.join(resolved, ".git"))) {
      throw new Error("Not a git repository");
    }
    return resolved;
  }

  async _git(args, cwd) {
    const cmd = process.platform === "win32" ? "git.exe" : "git";
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd,
      timeout: this.timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return {
      stdout: (stdout || "").trim(),
      stderr: (stderr || "").trim(),
    };
  }

  _inferNameFromUrl(repoUrl) {
    const cleaned = repoUrl.replace(/\.git$/i, "");
    const parts = cleaned.split(/[/:]/).filter(Boolean);
    return parts[parts.length - 1] || `repo_${Date.now()}`;
  }

  async clone(repoUrl, opts = {}) {
    await this.ensureBaseDir();
    const safeUrl = this._validateRepoUrl(repoUrl);
    const name = this._safeRepoName(
      opts.name || this._inferNameFromUrl(safeUrl),
    );
    const branch = opts.branch;
    if (branch && !SAFE_BRANCH.test(branch)) {
      throw new Error("Invalid branch name");
    }

    const targetPath = path.resolve(path.join(this.baseDir, name));
    if (!targetPath.startsWith(this.baseDir + path.sep)) {
      throw new Error("Invalid target path");
    }
    if (existsSync(targetPath)) {
      throw new Error("Target repository path already exists");
    }

    const args = ["clone", "--", safeUrl, targetPath];
    if (branch) {
      args.splice(1, 0, "--branch", branch, "--single-branch");
    }

    const result = await this._git(args, this.baseDir);
    return {
      repoPath: targetPath,
      repoName: name,
      branch: branch || null,
      ...result,
    };
  }

  async open(repoPath) {
    const safePath = this._resolveManagedRepo(repoPath);
    const [status, branch] = await Promise.all([
      this._git(["status", "--short"], safePath),
      this._git(["rev-parse", "--abbrev-ref", "HEAD"], safePath),
    ]);

    return {
      repoPath: safePath,
      branch: branch.stdout || "unknown",
      status: status.stdout,
    };
  }

  async pull(repoPath) {
    const safePath = this._resolveManagedRepo(repoPath);
    const result = await this._git(["pull", "--ff-only"], safePath);
    return { repoPath: safePath, ...result };
  }

  async createBranch(repoPath, branchName, checkout = true) {
    const safePath = this._resolveManagedRepo(repoPath);
    if (!SAFE_BRANCH.test(branchName || "")) {
      throw new Error("Invalid branch name");
    }
    const args = checkout
      ? ["checkout", "-b", branchName]
      : ["branch", branchName];
    const result = await this._git(args, safePath);
    return { repoPath: safePath, branch: branchName, checkout, ...result };
  }

  async status(repoPath) {
    const safePath = this._resolveManagedRepo(repoPath);
    const [shortStatus, branch, head] = await Promise.all([
      this._git(["status", "--short"], safePath),
      this._git(["rev-parse", "--abbrev-ref", "HEAD"], safePath),
      this._git(["rev-parse", "HEAD"], safePath),
    ]);

    return {
      repoPath: safePath,
      branch: branch.stdout,
      head: head.stdout,
      status: shortStatus.stdout,
    };
  }

  async diff(repoPath, baseRef, headRef) {
    const safePath = this._resolveManagedRepo(repoPath);
    const args = ["diff"];
    if (baseRef && headRef) {
      args.push(`${baseRef}...${headRef}`);
    }
    const result = await this._git(args, safePath);
    return {
      repoPath: safePath,
      baseRef: baseRef || null,
      headRef: headRef || null,
      diff: result.stdout,
    };
  }

  async commit(repoPath, message, files = []) {
    const safePath = this._resolveManagedRepo(repoPath);
    if (!message || typeof message !== "string" || message.trim().length < 3) {
      throw new Error("Commit message must be at least 3 characters");
    }

    if (Array.isArray(files) && files.length > 0) {
      for (const rel of files) {
        if (typeof rel !== "string" || rel.includes("..")) {
          throw new Error("Invalid file in commit list");
        }
      }
      await this._git(["add", "--", ...files], safePath);
    } else {
      await this._git(["add", "-A"], safePath);
    }

    const status = await this._git(["status", "--short"], safePath);
    if (!status.stdout) {
      return {
        repoPath: safePath,
        committed: false,
        message: "No staged changes to commit",
      };
    }

    const commitResult = await this._git(
      ["commit", "-m", message.trim()],
      safePath,
    );
    const head = await this._git(["rev-parse", "HEAD"], safePath);

    return {
      repoPath: safePath,
      committed: true,
      commit: head.stdout,
      output: commitResult.stdout || commitResult.stderr,
    };
  }
}

module.exports = { GitRepoService };
