/**
 * Repo Intelligence — In-Memory Repository Index
 *
 * Provides:
 *  - Full repo scan + analysis (symbols, imports/exports, dependency graph)
 *  - Keyword / TF-IDF search across all indexed files
 *  - Change-impact analysis (which files are affected by a change?)
 *  - Context assembly for LLM prompts (budgeted, ranked)
 *
 * Designed as a singleton per workspace.  Pure CJS, zero core/ deps.
 *
 * Usage:
 *   const { RepoIndex } = require('./repo-index');
 *   const idx = new RepoIndex();
 *   await idx.scan('/path/to/repo');
 *   const results = idx.search(['handleClick', 'Button']);
 */
"use strict";

const { walkRepo, readFileContent, detectLanguage } = require("./file-walker");
const {
  extractImports,
  extractExports,
  extractSymbols,
  buildDependencyGraph,
  analyzeChangeImpact,
  rankFilesByRelevance,
} = require("./symbol-extractor");
const { buildAstSymbolGraph } = require("./ast-symbol-graph");
const { EmbeddingIndex } = require("./embedding-index");
const { logger } = require("../logger");

// ─── Repo Index ──────────────────────────────────────────────────────────────

class RepoIndex {
  constructor() {
    /** @type {Map<string, IndexedFile>} relativePath → data */
    this.files = new Map();

    /** Dependency graph edges */
    this.graph = {
      edges: [],
      adjacency: new Map(),
      reverseAdjacency: new Map(),
    };

    /** AST-backed symbol/call graph */
    this.astGraph = {
      enabled: false,
      parser: "none",
      filesProcessed: 0,
      symbolNodes: [],
      callEdges: [],
      importEdges: [],
      byFile: {},
    };

    /** Semantic embedding index for retrieval */
    this.embeddingIndex = new EmbeddingIndex();

    /** Scan metadata */
    this.meta = {
      repoRoot: null,
      lastScanTime: null,
      scanDurationMs: 0,
      fileCount: 0,
      symbolCount: 0,
    };

    /** Symbol name → Set<relativePath> for fast lookup */
    this._symbolIndex = new Map();

    /** Export name → Set<relativePath> */
    this._exportIndex = new Map();
  }

  /**
   * Scan an entire repository: walk files, read source, extract symbols,
   * build dependency graph.
   *
   * @param {string} repoRoot
   * @param {Object} [opts] - Options forwarded to walkRepo + extras
   * @param {number} [opts.maxFiles=30000]
   * @param {number} [opts.maxFileSizeBytes=524288] - 512 KB default for indexing
   * @param {boolean} [opts.incremental=false] - If true, only re-index changed files
   * @returns {Promise<{ fileCount: number, symbolCount: number, edgeCount: number, durationMs: number }>}
   */
  async scan(repoRoot, opts = {}) {
    const startTime = Date.now();
    this.meta.repoRoot = repoRoot;

    const walkOpts = {
      maxFiles: opts.maxFiles ?? 30000,
      maxFileSizeBytes: opts.maxFileSizeBytes ?? 524_288,
      includeExts: opts.includeExts,
      excludeExts: opts.excludeExts,
      extraIgnoreDirs: opts.extraIgnoreDirs,
    };

    logger.info("RepoIndex: starting scan", {
      repoRoot,
      maxFiles: walkOpts.maxFiles,
    });

    const { files: fileInfos, stats } = await walkRepo(repoRoot, walkOpts);

    let symbolCount = 0;
    const newFiles = new Map();

    // Batch-read and analyze files
    const BATCH = 200;
    for (let i = 0; i < fileInfos.length; i += BATCH) {
      const batch = fileInfos.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (fi) => {
          try {
            // Incremental: skip unchanged files
            if (opts.incremental && this.files.has(fi.relativePath)) {
              const existing = this.files.get(fi.relativePath);
              if (existing.mtime >= fi.mtime) {
                newFiles.set(fi.relativePath, existing);
                symbolCount += existing.symbols.length;
                return;
              }
            }

            const source = await readFileContent(
              fi.absolutePath,
              walkOpts.maxFileSizeBytes,
            );
            if (source === null) return;

            const lang = fi.language || detectLanguage(fi.relativePath);
            const symbols = lang ? extractSymbols(source, lang) : [];
            const imports = lang ? extractImports(source, lang) : [];
            const exps = lang ? extractExports(source, lang) : [];

            symbolCount += symbols.length;

            newFiles.set(fi.relativePath, {
              relativePath: fi.relativePath,
              absolutePath: fi.absolutePath,
              language: lang,
              sizeBytes: fi.sizeBytes,
              mtime: fi.mtime,
              source,
              symbols,
              imports,
              exports: exps,
              lineCount: source.split("\n").length,
            });
          } catch (err) {
            logger.warn("RepoIndex: failed to analyze file", {
              file: fi.relativePath,
              error: err.message,
            });
          }
        }),
      );
    }

    this.files = newFiles;

    // Build dependency graph
    this.graph = buildDependencyGraph(this.files);

    // Build AST-backed symbol/call graph when parser is available
    this.astGraph = buildAstSymbolGraph(this.files);

    // Build semantic embedding index
    this.embeddingIndex.clear();
    for (const [relPath, info] of this.files.entries()) {
      const symbolNames = (info.symbols || []).map((s) => s.name).join(" ");
      const exportNames = (info.exports || []).map((e) => e.name).join(" ");
      const semanticText = [
        relPath,
        info.language || "",
        symbolNames,
        exportNames,
        info.source,
      ].join("\n");
      this.embeddingIndex.upsert(relPath, semanticText, {
        relativePath: relPath,
        language: info.language,
      });
    }

    // Build inverse indexes
    this._buildIndexes();

    const durationMs = Date.now() - startTime;
    this.meta.lastScanTime = new Date().toISOString();
    this.meta.scanDurationMs = durationMs;
    this.meta.fileCount = this.files.size;
    this.meta.symbolCount = symbolCount;

    logger.info("RepoIndex: scan complete", {
      files: this.files.size,
      symbols: symbolCount,
      edges: this.graph.edges.length,
      astSymbols: this.astGraph.symbolNodes.length,
      astCalls: this.astGraph.callEdges.length,
      durationMs,
      truncated: stats.truncated,
    });

    return {
      fileCount: this.files.size,
      symbolCount,
      edgeCount: this.graph.edges.length,
      durationMs,
    };
  }

  /** Rebuild symbol and export inverse indexes. */
  _buildIndexes() {
    this._symbolIndex.clear();
    this._exportIndex.clear();

    for (const [relPath, info] of this.files) {
      for (const sym of info.symbols) {
        if (!this._symbolIndex.has(sym.name)) {
          this._symbolIndex.set(sym.name, new Set());
        }
        this._symbolIndex.get(sym.name).add(relPath);
      }
      for (const exp of info.exports) {
        if (!this._exportIndex.has(exp.name)) {
          this._exportIndex.set(exp.name, new Set());
        }
        this._exportIndex.get(exp.name).add(relPath);
      }
    }
  }

  // ─── Query Methods ───────────────────────────────────────────────────────

  /**
   * Keyword search across all indexed files.  Returns ranked results.
   * @param {string[]} terms
   * @param {number} [topK=20]
   */
  search(terms, topK = 20) {
    return rankFilesByRelevance(
      terms,
      this.files,
      this.graph.reverseAdjacency,
      topK,
    );
  }

  /**
   * Semantic vector search over indexed files.
   * @param {string} query
   * @param {number} [topK=20]
   */
  semanticSearch(query, topK = 20) {
    if (!query || typeof query !== "string") return [];
    return this.embeddingIndex.search(query, topK).map((r) => ({
      relativePath: r.id,
      score: r.score,
      reason: "semantic",
      language: r.language,
    }));
  }

  /**
   * Hybrid search combining lexical TF-IDF ranking and semantic similarity.
   * @param {string[]} terms
   * @param {Object} [opts]
   * @param {number} [opts.topK=20]
   * @param {number} [opts.lexicalWeight=0.55]
   * @param {number} [opts.semanticWeight=0.45]
   */
  hybridSearch(terms, opts = {}) {
    const topK = opts.topK || 20;
    const lexicalWeight = opts.lexicalWeight ?? 0.55;
    const semanticWeight = opts.semanticWeight ?? 0.45;
    const lexical = this.search(terms, topK * 2);
    const semantic = this.semanticSearch((terms || []).join(" "), topK * 2);

    const lexicalMax = lexical.length > 0 ? lexical[0].score || 1 : 1;
    const semanticMax = semantic.length > 0 ? semantic[0].score || 1 : 1;

    const merged = new Map();
    for (const item of lexical) {
      merged.set(item.relativePath, {
        relativePath: item.relativePath,
        lexicalScore: (item.score || 0) / lexicalMax,
        semanticScore: 0,
        reason: item.reason,
      });
    }
    for (const item of semantic) {
      const prev = merged.get(item.relativePath) || {
        relativePath: item.relativePath,
        lexicalScore: 0,
        semanticScore: 0,
        reason: item.reason,
      };
      prev.semanticScore = (item.score || 0) / semanticMax;
      merged.set(item.relativePath, prev);
    }

    const ranked = Array.from(merged.values())
      .map((row) => ({
        relativePath: row.relativePath,
        score:
          row.lexicalScore * lexicalWeight + row.semanticScore * semanticWeight,
        reason: `hybrid(l=${row.lexicalScore.toFixed(3)},s=${row.semanticScore.toFixed(3)})`,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return ranked;
  }

  /**
   * Find files that define a specific symbol.
   * @param {string} symbolName
   * @returns {{ relativePath: string, symbol: Object }[]}
   */
  findSymbol(symbolName) {
    const paths = this._symbolIndex.get(symbolName);
    if (!paths) return [];
    const results = [];
    for (const p of paths) {
      const info = this.files.get(p);
      if (!info) continue;
      const sym = info.symbols.find((s) => s.name === symbolName);
      if (sym) results.push({ relativePath: p, symbol: sym });
    }
    return results;
  }

  /**
   * Find files that export a specific name.
   * @param {string} exportName
   * @returns {{ relativePath: string, export: Object }[]}
   */
  findExport(exportName) {
    const paths = this._exportIndex.get(exportName);
    if (!paths) return [];
    const results = [];
    for (const p of paths) {
      const info = this.files.get(p);
      if (!info) continue;
      const exp = info.exports.find((e) => e.name === exportName);
      if (exp) results.push({ relativePath: p, export: exp });
    }
    return results;
  }

  /**
   * Get direct + transitive dependents of changed files.
   * @param {string[]} changedFiles - relative paths
   * @returns {{ directlyImpacted: string[], transitivelyImpacted: string[] }}
   */
  getChangeImpact(changedFiles) {
    return analyzeChangeImpact(changedFiles, this.graph.reverseAdjacency);
  }

  /**
   * Get the dependency chain for a file (what it imports).
   * @param {string} relativePath
   * @returns {string[]}
   */
  getDependencies(relativePath) {
    return this.graph.adjacency.get(relativePath) || [];
  }

  /**
   * Get files that depend on a given file.
   * @param {string} relativePath
   * @returns {string[]}
   */
  getDependents(relativePath) {
    return this.graph.reverseAdjacency.get(relativePath) || [];
  }

  /**
   * Get callers for a symbol name from AST-backed call graph.
   * @param {string} symbolName
   * @returns {Array<Object>}
   */
  getCallers(symbolName) {
    if (!symbolName) return [];
    return (this.astGraph.callEdges || []).filter(
      (e) => e.toName === symbolName,
    );
  }

  /**
   * Get full file info.
   * @param {string} relativePath
   * @returns {IndexedFile|null}
   */
  getFile(relativePath) {
    return this.files.get(relativePath) || null;
  }

  /**
   * List all files matching a glob-like pattern (simple substring + language filter).
   * @param {{ language?: string, pathContains?: string }} filter
   * @returns {string[]}
   */
  listFiles(filter = {}) {
    const results = [];
    for (const [relPath, info] of this.files) {
      if (filter.language && info.language !== filter.language) continue;
      if (filter.pathContains && !relPath.includes(filter.pathContains)) {
        continue;
      }
      results.push(relPath);
    }
    return results;
  }

  // ─── Context Assembly ─────────────────────────────────────────────────────

  /**
   * Assemble context for an LLM prompt, respecting a token budget.
   * Picks the most relevant files for the given query terms.
   *
   * @param {string[]} queryTerms
   * @param {Object} [opts]
   * @param {number} [opts.maxTokens=8000] - Approximate token budget (1 token ≈ 4 chars)
   * @param {number} [opts.maxFiles=15]
   * @param {string[]} [opts.mustInclude] - relativePaths to always include
   * @returns {{ context: string, files: string[], tokenEstimate: number }}
   */
  assembleContext(queryTerms, opts = {}) {
    const maxTokens = opts.maxTokens ?? 8000;
    const maxFiles = opts.maxFiles ?? 15;
    const mustInclude = opts.mustInclude || [];

    const ranked = this.hybridSearch(queryTerms, {
      topK: maxFiles + mustInclude.length,
      lexicalWeight: opts.lexicalWeight,
      semanticWeight: opts.semanticWeight,
    });

    // Merge must-include files at the top
    const orderedPaths = [
      ...new Set([...mustInclude, ...ranked.map((r) => r.relativePath)]),
    ].slice(0, maxFiles);

    let totalChars = 0;
    const maxChars = maxTokens * 4;
    const snippets = [];
    const includedFiles = [];

    for (const relPath of orderedPaths) {
      const info = this.files.get(relPath);
      if (!info) continue;

      let content = info.source;
      const available = maxChars - totalChars;
      if (available <= 0) break;

      if (content.length > available) {
        // Truncate to budget, try to cut at a line boundary
        content = content.slice(0, available);
        const lastNl = content.lastIndexOf("\n");
        if (lastNl > available * 0.5) content = content.slice(0, lastNl);
        content += "\n// ... (truncated)";
      }

      snippets.push(`// ─── ${relPath} ───\n${content}`);
      includedFiles.push(relPath);
      totalChars += content.length;
    }

    const context = snippets.join("\n\n");
    return {
      context,
      files: includedFiles,
      tokenEstimate: Math.ceil(totalChars / 4),
      retrieval: {
        mode: "hybrid",
        lexicalWeight: opts.lexicalWeight ?? 0.55,
        semanticWeight: opts.semanticWeight ?? 0.45,
      },
    };
  }

  /**
   * Get a summary of the repository structure (for LLM system prompts).
   * @param {number} [maxLines=100]
   * @returns {string}
   */
  getRepoSummary(maxLines = 100) {
    const lines = [];
    lines.push(`Repository: ${this.meta.repoRoot}`);
    lines.push(
      `Files: ${this.meta.fileCount} | Symbols: ${this.meta.symbolCount} | Dependencies: ${this.graph.edges.length}`,
    );
    lines.push(
      `AST symbols: ${this.astGraph.symbolNodes.length} | AST calls: ${this.astGraph.callEdges.length}`,
    );
    lines.push("");

    // Language breakdown
    const langCounts = {};
    for (const [, info] of this.files) {
      if (info.language) {
        langCounts[info.language] = (langCounts[info.language] || 0) + 1;
      }
    }
    const sortedLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
    lines.push("Languages:");
    for (const [lang, count] of sortedLangs.slice(0, 15)) {
      lines.push(`  ${lang}: ${count} files`);
    }
    lines.push("");

    // Top-level directory structure
    const dirs = new Set();
    for (const [relPath] of this.files) {
      const parts = relPath.split("/");
      if (parts.length > 1) dirs.add(parts[0] + "/");
    }
    lines.push("Top-level directories:");
    for (const d of [...dirs].sort()) {
      lines.push(`  ${d}`);
    }
    lines.push("");

    // Most-depended-on files (hubs)
    const hubScores = [];
    for (const [file, importers] of this.graph.reverseAdjacency) {
      hubScores.push({ file, score: importers.length });
    }
    hubScores.sort((a, b) => b.score - a.score);
    lines.push("Most-imported files:");
    for (const { file, score } of hubScores.slice(0, 10)) {
      lines.push(`  ${file} (${score} dependents)`);
    }

    return lines.slice(0, maxLines).join("\n");
  }

  /**
   * Serialize index state for persistence (JSON-safe, without raw source).
   */
  toJSON() {
    const files = {};
    for (const [relPath, info] of this.files) {
      files[relPath] = {
        relativePath: info.relativePath,
        language: info.language,
        sizeBytes: info.sizeBytes,
        mtime: info.mtime,
        lineCount: info.lineCount,
        symbols: info.symbols,
        imports: info.imports,
        exports: info.exports,
      };
    }
    return {
      meta: this.meta,
      files,
      edges: this.graph.edges.length,
      ast: {
        enabled: this.astGraph.enabled,
        parser: this.astGraph.parser,
        filesProcessed: this.astGraph.filesProcessed,
        symbolNodes: this.astGraph.symbolNodes.length,
        callEdges: this.astGraph.callEdges.length,
      },
    };
  }
}

module.exports = { RepoIndex };
