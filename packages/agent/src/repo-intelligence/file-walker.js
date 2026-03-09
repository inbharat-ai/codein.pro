/**
 * Repo Intelligence — File Walker
 *
 * Recursive file scanner with .gitignore support, language detection,
 * and metadata collection.  Pure CJS, zero dependencies on core/.
 *
 * Usage:
 *   const { walkRepo } = require('./file-walker');
 *   const files = await walkRepo('/path/to/repo', { maxFiles: 50000 });
 */
"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

// ─── Language Detection ──────────────────────────────────────────────────────

const EXT_TO_LANG = Object.freeze({
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".py": "python",
  ".pyw": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".m": "objective-c",
  ".mm": "objective-c",
  ".php": "php",
  ".lua": "lua",
  ".r": "r",
  ".R": "r",
  ".jl": "julia",
  ".dart": "dart",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hrl": "erlang",
  ".hs": "haskell",
  ".lhs": "haskell",
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".fs": "fsharp",
  ".fsi": "fsharp",
  ".fsx": "fsharp",
  ".pl": "perl",
  ".pm": "perl",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".ps1": "powershell",
  ".psm1": "powershell",
  ".sql": "sql",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".md": "markdown",
  ".mdx": "markdown",
  ".vue": "vue",
  ".svelte": "svelte",
  ".astro": "astro",
  ".zig": "zig",
  ".nim": "nim",
  ".v": "vlang",
  ".proto": "protobuf",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".tf": "terraform",
  ".dockerfile": "dockerfile",
  ".cmake": "cmake",
  ".gradle": "groovy",
  ".groovy": "groovy",
  ".clj": "clojure",
  ".cljs": "clojure",
  ".cljc": "clojure",
});

const FILENAME_TO_LANG = Object.freeze({
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  Rakefile: "ruby",
  Gemfile: "ruby",
  CMakeLists: "cmake",
  Vagrantfile: "ruby",
  Procfile: "yaml",
});

/** Default directories to always skip. */
const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "env",
  ".env",
  ".idea",
  ".vscode",
  ".DS_Store",
  "vendor",
  "target",
  "Pods",
  ".gradle",
  ".dart_tool",
  ".pub-cache",
]);

/** Binary file extensions to skip. */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".svg",
  ".webp",
  ".avif",
  ".mp3",
  ".mp4",
  ".avi",
  ".mov",
  ".mkv",
  ".wav",
  ".flac",
  ".ogg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".jar",
  ".war",
  ".class",
  ".pyc",
  ".pyo",
  ".o",
  ".a",
  ".lib",
  ".obj",
  ".wasm",
  ".map",
  ".lock",
  ".min.js",
  ".min.css",
]);

// ─── Gitignore Parser ────────────────────────────────────────────────────────

/**
 * Minimal .gitignore pattern → regex compiler.
 * Handles: negation (!), directory-only (/), globstars (**), wildcards (* ?).
 */
function parseGitignore(content) {
  const rules = [];
  for (const raw of content.split("\n")) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    let negate = false;
    if (line.startsWith("!")) {
      negate = true;
      line = line.slice(1);
    }

    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }

    // Strip leading / for anchored patterns
    const anchored = line.includes("/");
    if (line.startsWith("/")) {
      line = line.slice(1);
    }

    // Convert glob to regex
    let re = line
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials (except * ?)
      .replace(/\*\*/g, "§GLOBSTAR§")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/§GLOBSTAR§/g, ".*");

    // If pattern doesn't contain /, it matches basename anywhere
    if (!anchored) {
      re = `(^|/)${re}`;
    } else {
      re = `^${re}`;
    }
    re += "(/|$)";

    rules.push({ regex: new RegExp(re), negate, dirOnly });
  }
  return rules;
}

/**
 * Check if a relative path is ignored by gitignore rules.
 */
function isIgnored(relPath, isDir, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.regex.test(relPath)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

// ─── Detect Language ─────────────────────────────────────────────────────────

function detectLanguage(filePath) {
  const basename = path.basename(filePath);
  const nameNoExt = basename.replace(/\.[^.]+$/, "");
  if (FILENAME_TO_LANG[nameNoExt]) return FILENAME_TO_LANG[nameNoExt];
  if (FILENAME_TO_LANG[basename]) return FILENAME_TO_LANG[basename];
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] || null;
}

function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

// ─── Main Walker ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} FileInfo
 * @property {string} absolutePath
 * @property {string} relativePath - Relative to repo root, forward-slash separated
 * @property {string|null} language
 * @property {number} sizeBytes
 * @property {number} mtime - Last modified timestamp (ms)
 */

/**
 * Recursively walk a repository, respecting .gitignore rules at every level.
 *
 * @param {string} repoRoot - Absolute path to the repository root
 * @param {Object} [opts]
 * @param {number} [opts.maxFiles=50000] - Stop after collecting this many files
 * @param {number} [opts.maxFileSizeBytes=1048576] - Skip files larger than this (default 1 MB)
 * @param {string[]} [opts.includeExts] - If provided, only include these extensions
 * @param {string[]} [opts.excludeExts] - Extensions to exclude
 * @param {string[]} [opts.extraIgnoreDirs] - Additional directory names to skip
 * @returns {Promise<{ files: FileInfo[], stats: Object }>}
 */
async function walkRepo(repoRoot, opts = {}) {
  const maxFiles = opts.maxFiles ?? 50000;
  const maxSize = opts.maxFileSizeBytes ?? 1_048_576;
  const includeExts = opts.includeExts
    ? new Set(opts.includeExts.map((e) => e.toLowerCase()))
    : null;
  const excludeExts = opts.excludeExts
    ? new Set(opts.excludeExts.map((e) => e.toLowerCase()))
    : null;
  const extraIgnore = opts.extraIgnoreDirs
    ? new Set(opts.extraIgnoreDirs)
    : null;

  const files = [];
  const stats = {
    totalScanned: 0,
    totalSkipped: 0,
    byLanguage: {},
    totalSizeBytes: 0,
    truncated: false,
  };

  // Load root .gitignore
  const rootIgnoreRules = await loadGitignore(repoRoot);

  // DFS stack: [dirAbsPath, gitignoreRules[]]
  const stack = [[repoRoot, rootIgnoreRules]];

  while (stack.length > 0) {
    if (files.length >= maxFiles) {
      stats.truncated = true;
      break;
    }

    const [dirPath, parentRules] = stack.pop();

    let entries;
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch {
      continue; // Permission denied, etc.
    }

    // Load directory-level .gitignore (inherits parent rules)
    let dirRules = parentRules;
    const localIgnorePath = path.join(dirPath, ".gitignore");
    try {
      if (fs.existsSync(localIgnorePath)) {
        const content = await fsp.readFile(localIgnorePath, "utf-8");
        dirRules = [...parentRules, ...parseGitignore(content)];
      }
    } catch {
      // ignore read errors
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        stats.truncated = true;
        break;
      }

      const entryAbs = path.join(dirPath, entry.name);
      const entryRel = path.relative(repoRoot, entryAbs).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        // Skip default ignores
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        if (extraIgnore && extraIgnore.has(entry.name)) continue;
        if (isIgnored(entryRel, true, dirRules)) continue;
        stack.push([entryAbs, dirRules]);
      } else if (entry.isFile()) {
        stats.totalScanned++;

        // Skip binary
        if (isBinaryFile(entry.name)) {
          stats.totalSkipped++;
          continue;
        }

        // Extension filter
        const ext = path.extname(entry.name).toLowerCase();
        if (includeExts && !includeExts.has(ext)) {
          stats.totalSkipped++;
          continue;
        }
        if (excludeExts && excludeExts.has(ext)) {
          stats.totalSkipped++;
          continue;
        }

        // .gitignore check
        if (isIgnored(entryRel, false, dirRules)) {
          stats.totalSkipped++;
          continue;
        }

        // Size check
        let fstat;
        try {
          fstat = await fsp.stat(entryAbs);
        } catch {
          stats.totalSkipped++;
          continue;
        }
        if (fstat.size > maxSize) {
          stats.totalSkipped++;
          continue;
        }

        const lang = detectLanguage(entry.name);
        files.push({
          absolutePath: entryAbs,
          relativePath: entryRel,
          language: lang,
          sizeBytes: fstat.size,
          mtime: fstat.mtimeMs,
        });

        stats.totalSizeBytes += fstat.size;
        if (lang) {
          stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;
        }
      }
    }
  }

  return { files, stats };
}

/**
 * Load .gitignore from a directory, returning parsed rules.
 */
async function loadGitignore(dirPath) {
  const ignorePath = path.join(dirPath, ".gitignore");
  try {
    const content = await fsp.readFile(ignorePath, "utf-8");
    return parseGitignore(content);
  } catch {
    return [];
  }
}

/**
 * Read file content with size guard and encoding detection.
 * @param {string} filePath
 * @param {number} [maxBytes=1048576]
 * @returns {Promise<string|null>}
 */
async function readFileContent(filePath, maxBytes = 1_048_576) {
  try {
    const stat = await fsp.stat(filePath);
    if (stat.size > maxBytes) return null;
    return await fsp.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

module.exports = {
  walkRepo,
  readFileContent,
  detectLanguage,
  isBinaryFile,
  parseGitignore,
  isIgnored,
  DEFAULT_IGNORE_DIRS,
  EXT_TO_LANG,
};
