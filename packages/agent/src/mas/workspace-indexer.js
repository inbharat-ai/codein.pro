/**
 * CodIn MAS — Workspace Indexer
 *
 * Scans the workspace to build a searchable file index with:
 *   - File paths, sizes, languages
 *   - Export/import analysis (JS/TS)
 *   - Dependency graph edges
 *   - Framework/stack detection
 *
 * Gives agents real context about the codebase instead of blind file reads.
 * Results are cached in SQLite via the persistence layer.
 */
"use strict";

const pathModule = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { createLogger } = require("./logger");

const log = createLogger("WorkspaceIndexer");

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  ".turbo",
  ".nuxt",
  ".svelte-kit",
  "target",
  "bin",
  "obj",
]);

const LANGUAGE_MAP = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".py": "python",
  ".pyw": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".scala": "scala",
  ".rb": "ruby",
  ".php": "php",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".vue": "vue",
  ".svelte": "svelte",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
  ".mdx": "markdown",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".sql": "sql",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".proto": "protobuf",
  ".dockerfile": "docker",
};

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp4",
  ".mp3",
  ".wav",
  ".ogg",
  ".webm",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".lock",
  ".map",
]);

// Regex for JS/TS export detection
const EXPORT_PATTERNS = [
  /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g,
  /export\s*\{([^}]+)\}/g,
  /module\.exports\s*=\s*\{([^}]+)\}/g,
  /module\.exports\s*=\s*(\w+)/g,
  /exports\.(\w+)\s*=/g,
];

// Regex for JS/TS import detection
const IMPORT_PATTERNS = [
  /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
  /import\s*\(['"]([^'"]+)['"]\)/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

// ═══════════════════════════════════════════════════════════════
// Workspace Indexer
// ═══════════════════════════════════════════════════════════════

class WorkspaceIndexer {
  /**
   * @param {object} persistence — PersistenceStore instance
   */
  constructor(persistence) {
    this._persistence = persistence;
  }

  /**
   * Compute a stable hash for a workspace root path.
   * @param {string} workspaceRoot
   * @returns {string}
   */
  static workspaceHash(workspaceRoot) {
    return crypto
      .createHash("sha256")
      .update(workspaceRoot)
      .digest("hex")
      .slice(0, 16);
  }

  /**
   * Index a workspace: scan all source files, extract metadata.
   * @param {string} workspaceRoot — Absolute path to workspace
   * @param {object} [opts]
   * @param {number} [opts.maxFiles=5000]
   * @param {number} [opts.maxDepth=10]
   * @param {boolean} [opts.force=false] — Re-index even if cached
   * @returns {Promise<object>} Index summary
   */
  async index(workspaceRoot, opts = {}) {
    const maxFiles = opts.maxFiles || 5000;
    const maxDepth = opts.maxDepth || 10;
    const wsHash = WorkspaceIndexer.workspaceHash(workspaceRoot);

    // Check if index exists and is fresh (< 5 min old)
    if (!opts.force && this._persistence) {
      const existing = this._persistence.getFileIndex(wsHash);
      if (existing.length > 0) {
        const newest = existing[0]?.indexed_at;
        if (newest && Date.now() - new Date(newest).getTime() < 5 * 60 * 1000) {
          log.debug("Using cached index", { files: existing.length, wsHash });
          return this._buildSummary(existing, workspaceRoot);
        }
      }
    }

    log.info("Indexing workspace", { root: workspaceRoot });
    const startTime = Date.now();
    const entries = [];

    await this._scanDirectory(
      workspaceRoot,
      workspaceRoot,
      entries,
      0,
      maxDepth,
      maxFiles,
    );

    // Persist to SQLite
    if (this._persistence) {
      this._persistence.clearFileIndex(wsHash);
      this._persistence.indexFiles(wsHash, entries);
    }

    const elapsed = Date.now() - startTime;
    log.info("Indexing complete", {
      files: entries.length,
      durationMs: elapsed,
    });

    return this._buildSummary(entries, workspaceRoot);
  }

  /**
   * Search the file index by path pattern.
   * @param {string} workspaceRoot
   * @param {string} pattern — Substring to match (e.g., "controller", ".test.")
   * @param {number} [limit=50]
   * @returns {Array}
   */
  search(workspaceRoot, pattern, limit = 50) {
    if (!this._persistence) return [];
    const wsHash = WorkspaceIndexer.workspaceHash(workspaceRoot);
    return this._persistence.searchFiles(wsHash, pattern, limit);
  }

  /**
   * Get the full workspace summary for agent context.
   * @param {string} workspaceRoot
   * @returns {string} Formatted summary string
   */
  async getContextSummary(workspaceRoot) {
    const summary = await this.index(workspaceRoot);
    return this._formatForAgent(summary);
  }

  // ─── Private Methods ────────────────────────────────────

  async _scanDirectory(dir, root, entries, depth, maxDepth, maxFiles) {
    if (depth > maxDepth || entries.length >= maxFiles) return;

    let dirEntries;
    try {
      dirEntries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      if (entries.length >= maxFiles) break;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".github") continue;
        await this._scanDirectory(
          pathModule.join(dir, entry.name),
          root,
          entries,
          depth + 1,
          maxDepth,
          maxFiles,
        );
      } else if (entry.isFile()) {
        const ext = pathModule.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        const fullPath = pathModule.join(dir, entry.name);
        const relativePath = pathModule
          .relative(root, fullPath)
          .replace(/\\/g, "/");
        const language = LANGUAGE_MAP[ext] || null;

        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }

        // Skip very large files
        if (stat.size > 500 * 1024) continue;

        const fileEntry = {
          filePath: fullPath,
          relativePath,
          extension: ext,
          sizeBytes: stat.size,
          language,
          lastModified: stat.mtime.toISOString(),
          exports: [],
          imports: [],
        };

        // Extract exports/imports for JS/TS files
        if (language === "javascript" || language === "typescript") {
          try {
            const content = await fs.readFile(fullPath, "utf8");
            fileEntry.exports = this._extractExports(content);
            fileEntry.imports = this._extractImports(content);
          } catch {
            // Skip unreadable files
          }
        }

        entries.push(fileEntry);
      }
    }
  }

  _extractExports(content) {
    const exports = new Set();
    for (const pattern of EXPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const captured = match[1];
        if (captured) {
          // Handle comma-separated exports: { A, B, C }
          for (const name of captured.split(",")) {
            const trimmed = name
              .trim()
              .split(/\s+as\s+/)[0]
              .trim();
            if (trimmed && /^\w+$/.test(trimmed)) {
              exports.add(trimmed);
            }
          }
        }
      }
    }
    return [...exports].slice(0, 50);
  }

  _extractImports(content) {
    const imports = new Set();
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.add(match[1]);
      }
    }
    return [...imports].slice(0, 100);
  }

  _buildSummary(entries, workspaceRoot) {
    const byLanguage = {};
    const byDirectory = {};
    let totalSize = 0;
    const allExports = [];
    const frameworks = new Set();

    for (const entry of entries) {
      const lang = entry.language || "other";
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
      totalSize += entry.sizeBytes || entry.size_bytes || 0;

      // Group by top-level directory
      const rel = entry.relativePath || entry.relative_path;
      const topDir = rel.split("/")[0];
      byDirectory[topDir] = (byDirectory[topDir] || 0) + 1;

      // Collect exports
      const exports = entry.exports || [];
      if (exports.length > 0) {
        allExports.push({ path: rel, exports: exports.slice(0, 10) });
      }

      // Detect frameworks
      const imports = entry.imports || [];
      for (const imp of imports) {
        if (imp === "react" || imp === "react-dom") frameworks.add("React");
        if (imp === "vue") frameworks.add("Vue");
        if (imp === "svelte") frameworks.add("Svelte");
        if (imp === "express") frameworks.add("Express");
        if (imp === "next" || imp === "next/router") frameworks.add("Next.js");
        if (imp === "@angular/core") frameworks.add("Angular");
        if (imp === "electron") frameworks.add("Electron");
        if (imp === "fastify") frameworks.add("Fastify");
      }
    }

    return {
      workspaceRoot,
      fileCount: entries.length,
      totalSizeBytes: totalSize,
      byLanguage,
      byDirectory,
      frameworks: [...frameworks],
      topExports: allExports.slice(0, 30),
    };
  }

  _formatForAgent(summary) {
    const lines = [
      `WORKSPACE: ${summary.workspaceRoot}`,
      `FILES: ${summary.fileCount} source files (${(summary.totalSizeBytes / 1024).toFixed(0)} KB)`,
      "",
      "LANGUAGES:",
      ...Object.entries(summary.byLanguage)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => `  ${lang}: ${count} files`),
      "",
      "STRUCTURE:",
      ...Object.entries(summary.byDirectory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([dir, count]) => `  ${dir}/: ${count} files`),
    ];

    if (summary.frameworks.length > 0) {
      lines.push("", `FRAMEWORKS: ${summary.frameworks.join(", ")}`);
    }

    if (summary.topExports.length > 0) {
      lines.push("", "KEY EXPORTS:");
      for (const { path: p, exports } of summary.topExports.slice(0, 15)) {
        lines.push(`  ${p}: ${exports.join(", ")}`);
      }
    }

    return lines.join("\n");
  }
}

module.exports = { WorkspaceIndexer };
