/**
 * CodeIn Compute — Artifact Manager
 *
 * Manages artifacts (files, reports, diffs) produced by compute jobs.
 * Artifacts are stored in the job's isolated workspace.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ARTIFACT_TYPES = Object.freeze({
  FILE: "file",
  REPORT: "report",
  DIFF: "diff",
  LOG: "log",
  CODE: "code",
  DOC: "doc",
});

class ArtifactManager {
  constructor() {
    this._stats = { totalArtifacts: 0, totalSizeBytes: 0 };
  }

  /**
   * Store an artifact in a job's workspace.
   * @param {string} workspaceDir - Job workspace directory
   * @param {object} params
   * @param {string} params.name - Artifact filename
   * @param {string} params.type - One of ARTIFACT_TYPES
   * @param {string|Buffer} params.content - File content
   * @param {object} [params.metadata] - Optional metadata
   * @returns {object} Artifact record
   */
  store(workspaceDir, { name, type, content, metadata = {} }) {
    if (!name || typeof name !== "string") {
      throw new Error("Artifact name is required");
    }
    if (!Object.values(ARTIFACT_TYPES).includes(type)) {
      throw new Error(
        `Invalid artifact type: ${type}. Must be one of: ${Object.values(ARTIFACT_TYPES).join(", ")}`,
      );
    }

    // Sanitize name to prevent path traversal
    const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!safeName) throw new Error("Invalid artifact name after sanitization");

    const artifactsDir = path.join(workspaceDir, "artifacts");
    fs.mkdirSync(artifactsDir, { recursive: true });

    const artifactId = `art_${crypto.randomBytes(6).toString("hex")}`;
    const fileName = `${artifactId}_${safeName}`;
    const filePath = path.join(artifactsDir, fileName);

    // Write content
    const data = typeof content === "string" ? content : content;
    fs.writeFileSync(
      filePath,
      data,
      typeof content === "string" ? "utf8" : undefined,
    );

    const stat = fs.statSync(filePath);
    this._stats.totalArtifacts++;
    this._stats.totalSizeBytes += stat.size;

    return {
      id: artifactId,
      type,
      name: safeName,
      fileName,
      path: filePath,
      size: stat.size,
      createdAt: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Store a diff artifact.
   */
  storeDiff(workspaceDir, { name, original, modified, metadata = {} }) {
    const diffContent = this._generateSimpleDiff(original, modified);
    return this.store(workspaceDir, {
      name: name || "changes.diff",
      type: ARTIFACT_TYPES.DIFF,
      content: diffContent,
      metadata: {
        ...metadata,
        originalLength: original.length,
        modifiedLength: modified.length,
      },
    });
  }

  /**
   * Store a report artifact (markdown).
   */
  storeReport(workspaceDir, { title, sections, metadata = {} }) {
    let content = `# ${title}\n\n`;
    content += `> Generated: ${new Date().toISOString()}\n\n`;
    for (const section of sections) {
      content += `## ${section.heading}\n\n${section.body}\n\n`;
    }
    return this.store(workspaceDir, {
      name: `${title.replace(/\s+/g, "_").toLowerCase()}.md`,
      type: ARTIFACT_TYPES.REPORT,
      content,
      metadata,
    });
  }

  /**
   * Read an artifact's content.
   * @param {string} workspaceDir
   * @param {string} artifactId
   * @returns {object|null} { content, artifact } or null
   */
  read(workspaceDir, artifactId) {
    const artifactsDir = path.join(workspaceDir, "artifacts");
    if (!fs.existsSync(artifactsDir)) return null;

    const files = fs.readdirSync(artifactsDir);
    const match = files.find((f) => f.startsWith(artifactId));
    if (!match) return null;

    const filePath = path.join(artifactsDir, match);
    const content = fs.readFileSync(filePath, "utf8");
    const stat = fs.statSync(filePath);

    return {
      content,
      artifact: {
        id: artifactId,
        fileName: match,
        path: filePath,
        size: stat.size,
      },
    };
  }

  /**
   * List all artifacts in a job workspace.
   * @param {string} workspaceDir
   * @returns {object[]}
   */
  list(workspaceDir) {
    const artifactsDir = path.join(workspaceDir, "artifacts");
    if (!fs.existsSync(artifactsDir)) return [];

    return fs.readdirSync(artifactsDir).map((fileName) => {
      const filePath = path.join(artifactsDir, fileName);
      const stat = fs.statSync(filePath);
      const idMatch = fileName.match(/^(art_[a-f0-9]+)_/);
      return {
        id: idMatch ? idMatch[1] : fileName,
        fileName,
        path: filePath,
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
      };
    });
  }

  /**
   * Delete an artifact.
   */
  delete(workspaceDir, artifactId) {
    const artifactsDir = path.join(workspaceDir, "artifacts");
    if (!fs.existsSync(artifactsDir)) return false;

    const files = fs.readdirSync(artifactsDir);
    const match = files.find((f) => f.startsWith(artifactId));
    if (!match) return false;

    fs.unlinkSync(path.join(artifactsDir, match));
    return true;
  }

  /**
   * Get total size of artifacts in a workspace.
   */
  getWorkspaceSize(workspaceDir) {
    const artifactsDir = path.join(workspaceDir, "artifacts");
    if (!fs.existsSync(artifactsDir)) return 0;

    return fs.readdirSync(artifactsDir).reduce((total, f) => {
      return total + fs.statSync(path.join(artifactsDir, f)).size;
    }, 0);
  }

  getStats() {
    return { ...this._stats };
  }

  // ─── Internal ──────────────────────────────────────────────

  _generateSimpleDiff(original, modified) {
    const origLines = original.split("\n");
    const modLines = modified.split("\n");
    const lines = [];
    lines.push("--- original");
    lines.push("+++ modified");

    const maxLen = Math.max(origLines.length, modLines.length);
    for (let i = 0; i < maxLen; i++) {
      const origLine = origLines[i];
      const modLine = modLines[i];
      if (origLine === undefined) {
        lines.push(`+${modLine}`);
      } else if (modLine === undefined) {
        lines.push(`-${origLine}`);
      } else if (origLine !== modLine) {
        lines.push(`-${origLine}`);
        lines.push(`+${modLine}`);
      } else {
        lines.push(` ${origLine}`);
      }
    }
    return lines.join("\n");
  }
}

module.exports = {
  ArtifactManager,
  ARTIFACT_TYPES,
  artifactManager: new ArtifactManager(),
};
