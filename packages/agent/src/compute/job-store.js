/**
 * CodeIn Compute — Job Store
 *
 * Persistent storage for compute jobs using JSON files.
 * Each job is stored as ~/.codin/compute/jobs/<jobId>.json
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getDataDir } = require("../store");
const { validateJob } = require("./job-model");

class JobStore {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(getDataDir(), "compute");
    this.jobsDir = path.join(this.baseDir, "jobs");
    this._ensureDirs();
    this._index = new Map(); // in-memory index for fast lookup
    this._loadIndex();
  }

  _ensureDirs() {
    fs.mkdirSync(this.jobsDir, { recursive: true });
  }

  _jobPath(jobId) {
    // Prevent path traversal
    const safe = jobId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safe !== jobId) throw new Error(`Invalid job ID: ${jobId}`);
    return path.join(this.jobsDir, `${safe}.json`);
  }

  /**
   * Load the in-memory index from disk on startup.
   */
  _loadIndex() {
    try {
      const files = fs
        .readdirSync(this.jobsDir)
        .filter((f) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(this.jobsDir, file), "utf8");
          const job = JSON.parse(raw);
          if (job.id) {
            this._index.set(job.id, {
              id: job.id,
              status: job.status,
              goal: job.goal.slice(0, 100),
              language: job.language,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              userId: job.userId,
            });
          }
        } catch {
          // Skip corrupted files
        }
      }
    } catch {
      // jobsDir may not exist yet
    }
  }

  /**
   * Save a job to disk.
   * @param {object} job - Job object
   * @returns {object} The saved job
   */
  save(job) {
    const { valid, errors } = validateJob(job);
    if (!valid) {
      throw new Error(`Invalid job: ${errors.join(", ")}`);
    }

    const filePath = this._jobPath(job.id);
    const data = JSON.stringify(job, null, 2);

    // Atomic write: write to temp, rename
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, data, "utf8");
    fs.renameSync(tmpPath, filePath);

    // Update index
    this._index.set(job.id, {
      id: job.id,
      status: job.status,
      goal: job.goal.slice(0, 100),
      language: job.language,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      userId: job.userId,
    });

    return job;
  }

  /**
   * Load a job from disk.
   * @param {string} jobId
   * @returns {object|null} Job or null if not found
   */
  load(jobId) {
    try {
      const filePath = this._jobPath(jobId);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Delete a job and its workspace.
   * @param {string} jobId
   * @returns {boolean}
   */
  delete(jobId) {
    try {
      const filePath = this._jobPath(jobId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      // Remove workspace directory
      const workspaceDir = this.getWorkspaceDir(jobId);
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      }
      this._index.delete(jobId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List jobs with optional filters.
   * @param {object} [filters]
   * @param {string} [filters.userId]
   * @param {string} [filters.status]
   * @param {number} [filters.limit=50]
   * @param {number} [filters.offset=0]
   * @returns {{ jobs: object[], total: number }}
   */
  list(filters = {}) {
    const { userId, status, limit = 50, offset = 0 } = filters;

    let entries = Array.from(this._index.values());

    if (userId) {
      entries = entries.filter((e) => e.userId === userId);
    }
    if (status) {
      entries = entries.filter((e) => e.status === status);
    }

    // Sort by createdAt descending (newest first)
    entries.sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || ""),
    );

    const total = entries.length;
    const paged = entries.slice(offset, offset + limit);

    return { jobs: paged, total };
  }

  /**
   * Get the isolated workspace directory for a job.
   * @param {string} jobId
   * @returns {string}
   */
  getWorkspaceDir(jobId) {
    const safe = jobId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safe !== jobId) throw new Error(`Invalid job ID: ${jobId}`);
    return path.join(this.baseDir, safe);
  }

  /**
   * Ensure the workspace directory exists for a job.
   * @param {string} jobId
   * @returns {string} The workspace path
   */
  ensureWorkspace(jobId) {
    const dir = this.getWorkspaceDir(jobId);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    return dir;
  }

  /**
   * Get statistics about stored jobs.
   */
  getStats() {
    const entries = Array.from(this._index.values());
    const byStatus = {};
    for (const e of entries) {
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    }
    return {
      total: entries.length,
      byStatus,
    };
  }

  /**
   * Clean up old completed/failed/cancelled jobs.
   * @param {number} maxAgeMs - Max age in milliseconds (default: 7 days)
   * @returns {number} Number of jobs cleaned
   */
  cleanup(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
    let cleaned = 0;

    for (const [id, entry] of this._index) {
      if (terminalStatuses.has(entry.status) && entry.updatedAt < cutoff) {
        this.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

module.exports = {
  JobStore,
};
