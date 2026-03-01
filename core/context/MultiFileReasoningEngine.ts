/**
 * MultiFileReasoningEngine — Cross-file analysis for deep codebase understanding.
 *
 * Provides:
 *   1. Dependency graph construction (imports/exports across files)
 *   2. Symbol resolution across file boundaries
 *   3. Ranked multi-file context assembly based on relevance to query
 *   4. Call-chain tracing across files
 *   5. Change-impact analysis
 *
 * This plugs into the ContextBudgetManager so retrieved cross-file
 * context respects the token budget.
 */

import { ContextBudgetManager } from "./ContextBudgetManager.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileNode {
  uri: string;
  relativePath: string;
  language: string;
  imports: ImportEdge[];
  exports: ExportSymbol[];
  symbols: SymbolInfo[];
  lastModified?: number;
}

export interface ImportEdge {
  from: string; // relative path of the importing file
  to: string; // resolved path of the imported module
  symbols: string[]; // named imports (["*"] for wildcard)
  isDefault: boolean;
  isDynamic: boolean;
}

export interface ExportSymbol {
  name: string;
  kind:
    | "function"
    | "class"
    | "variable"
    | "type"
    | "interface"
    | "enum"
    | "default"
    | "re-export";
  line: number;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  references: string[]; // URIs of files that reference this symbol
}

export interface DependencyGraph {
  nodes: Map<string, FileNode>;
  edges: ImportEdge[];
  roots: string[]; // files with no incoming imports
  leaves: string[]; // files with no outgoing imports
}

export interface ReasoningContext {
  primaryFile: string;
  relatedFiles: RankedFile[];
  dependencyChain: string[];
  symbolCrossRefs: CrossReference[];
  totalTokens: number;
}

export interface RankedFile {
  uri: string;
  relativePath: string;
  relevanceScore: number;
  reason: string;
  content?: string;
  tokenCount?: number;
}

export interface CrossReference {
  symbol: string;
  definedIn: string;
  usedIn: string[];
  kind: string;
}

export interface ChangeImpact {
  changedFile: string;
  directDependents: string[];
  transitiveDependents: string[];
  affectedSymbols: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
}

// ── Import/Export Parsers ────────────────────────────────────────────────────

const TS_IMPORT_RE =
  /import\s+(?:(?:type\s+)?(?:\{([^}]*)\}|(\w+)(?:\s*,\s*\{([^}]*)\})?))\s+from\s+['"](\.?[^'"]+)['"]/g;
const TS_DYNAMIC_IMPORT_RE =
  /(?:await\s+)?import\s*\(\s*['"](\.?[^'"]+)['"]\s*\)/g;
const TS_REQUIRE_RE =
  /(?:const|let|var)\s+(?:\{([^}]*)\}|(\w+))\s*=\s*require\s*\(\s*['"](\.?[^'"]+)['"]\s*\)/g;
const TS_EXPORT_RE =
  /export\s+(?:(default)\s+)?(?:(function|class|const|let|var|type|interface|enum)\s+)?(\w+)?/g;

const PY_IMPORT_RE =
  /^(?:from\s+(\S+)\s+import\s+(.+)|import\s+(\S+)(?:\s+as\s+\S+)?)/gm;
const PY_DEF_RE = /^(?:def|class|async\s+def)\s+(\w+)/gm;

function parseImportsTS(content: string, filePath: string): ImportEdge[] {
  const imports: ImportEdge[] = [];
  let match;

  // Static imports
  TS_IMPORT_RE.lastIndex = 0;
  while ((match = TS_IMPORT_RE.exec(content)) !== null) {
    const namedStr = match[1] || match[3] || "";
    const defaultName = match[2] || "";
    const source = match[4];
    const symbols = namedStr
      ? namedStr
          .split(",")
          .map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)[0]
              .trim(),
          )
          .filter(Boolean)
      : defaultName
        ? [defaultName]
        : [];
    imports.push({
      from: filePath,
      to: source,
      symbols,
      isDefault: !!defaultName && !namedStr,
      isDynamic: false,
    });
  }

  // Dynamic imports
  TS_DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((match = TS_DYNAMIC_IMPORT_RE.exec(content)) !== null) {
    imports.push({
      from: filePath,
      to: match[1],
      symbols: ["*"],
      isDefault: false,
      isDynamic: true,
    });
  }

  // CommonJS require
  TS_REQUIRE_RE.lastIndex = 0;
  while ((match = TS_REQUIRE_RE.exec(content)) !== null) {
    const namedStr = match[1] || "";
    const defaultName = match[2] || "";
    const source = match[3];
    const symbols = namedStr
      ? namedStr
          .split(",")
          .map((s) =>
            s
              .trim()
              .split(/\s*:\s*/)[0]
              .trim(),
          )
          .filter(Boolean)
      : defaultName
        ? [defaultName]
        : [];
    imports.push({
      from: filePath,
      to: source,
      symbols,
      isDefault: !!defaultName && !namedStr,
      isDynamic: false,
    });
  }

  return imports;
}

function parseExportsTS(content: string): ExportSymbol[] {
  const exports: ExportSymbol[] = [];
  let match;
  TS_EXPORT_RE.lastIndex = 0;
  while ((match = TS_EXPORT_RE.exec(content)) !== null) {
    const isDefault = match[1] === "default";
    const kind =
      (match[2] as ExportSymbol["kind"]) ||
      (isDefault ? "default" : "variable");
    const name = match[3] || (isDefault ? "default" : "");
    if (name) {
      const linesBefore = content.slice(0, match.index).split("\n").length;
      exports.push({ name, kind, line: linesBefore });
    }
  }
  return exports;
}

function parseImportsPython(content: string, filePath: string): ImportEdge[] {
  const imports: ImportEdge[] = [];
  let match;
  PY_IMPORT_RE.lastIndex = 0;
  while ((match = PY_IMPORT_RE.exec(content)) !== null) {
    if (match[1]) {
      // from X import Y
      const symbols = match[2].split(",").map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      );
      imports.push({
        from: filePath,
        to: match[1],
        symbols,
        isDefault: false,
        isDynamic: false,
      });
    } else if (match[3]) {
      // import X
      imports.push({
        from: filePath,
        to: match[3],
        symbols: ["*"],
        isDefault: false,
        isDynamic: false,
      });
    }
  }
  return imports;
}

function parseExportsPython(content: string): ExportSymbol[] {
  const exports: ExportSymbol[] = [];
  let match;
  PY_DEF_RE.lastIndex = 0;
  while ((match = PY_DEF_RE.exec(content)) !== null) {
    const linesBefore = content.slice(0, match.index).split("\n").length;
    const kind = match[0].startsWith("class") ? "class" : "function";
    exports.push({ name: match[1], kind, line: linesBefore });
  }
  return exports;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    swift: "swift",
  };
  return langMap[ext] || "unknown";
}

// ── Multi-File Reasoning Engine ──────────────────────────────────────────────

export class MultiFileReasoningEngine {
  private graph: DependencyGraph;
  private fileContents: Map<string, string>;

  constructor() {
    this.graph = { nodes: new Map(), edges: [], roots: [], leaves: [] };
    this.fileContents = new Map();
  }

  /**
   * Index a set of files to build the dependency graph.
   */
  indexFiles(
    files: Array<{ uri: string; relativePath: string; content: string }>,
  ): void {
    // Reset
    this.graph = { nodes: new Map(), edges: [], roots: [], leaves: [] };
    this.fileContents.clear();

    // Parse each file
    for (const file of files) {
      this.fileContents.set(file.relativePath, file.content);
      const lang = detectLanguage(file.relativePath);
      let imports: ImportEdge[] = [];
      let exports: ExportSymbol[] = [];

      if (lang === "typescript" || lang === "javascript") {
        imports = parseImportsTS(file.content, file.relativePath);
        exports = parseExportsTS(file.content);
      } else if (lang === "python") {
        imports = parseImportsPython(file.content, file.relativePath);
        exports = parseExportsPython(file.content);
      }

      const node: FileNode = {
        uri: file.uri,
        relativePath: file.relativePath,
        language: lang,
        imports,
        exports,
        symbols: exports.map((e) => ({
          name: e.name,
          kind: e.kind,
          startLine: e.line,
          endLine: e.line, // simplified
          references: [],
        })),
      };

      this.graph.nodes.set(file.relativePath, node);
      this.graph.edges.push(...imports);
    }

    // Build reverse references
    this._buildReverseRefs();
    // Detect roots and leaves
    this._classifyRootsLeaves();
  }

  /**
   * Given a primary file and query, find the most relevant related files
   * across the dependency graph, ranked by relevance.
   */
  getReasoningContext(
    primaryFile: string,
    query: string,
    budget?: ContextBudgetManager,
    maxFiles = 15,
  ): ReasoningContext {
    const relatedFiles: RankedFile[] = [];
    const visited = new Set<string>();
    visited.add(primaryFile);

    const queryKeywords = this._extractKeywords(query);
    const primaryNode = this.graph.nodes.get(primaryFile);

    // 1. Direct imports (highest relevance)
    if (primaryNode) {
      for (const imp of primaryNode.imports) {
        const resolved = this._resolveImportPath(imp.to, primaryFile);
        if (resolved && !visited.has(resolved)) {
          visited.add(resolved);
          relatedFiles.push({
            uri: this.graph.nodes.get(resolved)?.uri || resolved,
            relativePath: resolved,
            relevanceScore: 0.9,
            reason: `Direct import from ${primaryFile}`,
            content: this.fileContents.get(resolved),
          });
        }
      }
    }

    // 2. Reverse dependencies (files that import the primary file)
    for (const edge of this.graph.edges) {
      const resolved = this._resolveImportPath(edge.to, edge.from);
      if (resolved === primaryFile && !visited.has(edge.from)) {
        visited.add(edge.from);
        relatedFiles.push({
          uri: this.graph.nodes.get(edge.from)?.uri || edge.from,
          relativePath: edge.from,
          relevanceScore: 0.8,
          reason: `Imports from ${primaryFile}`,
          content: this.fileContents.get(edge.from),
        });
      }
    }

    // 3. Sibling files (same directory)
    const primaryDir = primaryFile.split("/").slice(0, -1).join("/");
    for (const [filePath] of this.graph.nodes) {
      if (!visited.has(filePath) && filePath.startsWith(primaryDir + "/")) {
        visited.add(filePath);
        relatedFiles.push({
          uri: this.graph.nodes.get(filePath)?.uri || filePath,
          relativePath: filePath,
          relevanceScore: 0.5,
          reason: `Same directory as ${primaryFile}`,
          content: this.fileContents.get(filePath),
        });
      }
    }

    // 4. Keyword-matched files
    for (const [filePath, content] of this.fileContents) {
      if (visited.has(filePath)) continue;
      const fileKeywords = this._extractKeywords(content.slice(0, 5000));
      const overlap = this._keywordOverlap(queryKeywords, fileKeywords);
      if (overlap > 0.05) {
        visited.add(filePath);
        relatedFiles.push({
          uri: this.graph.nodes.get(filePath)?.uri || filePath,
          relativePath: filePath,
          relevanceScore: Math.min(0.7, 0.2 + overlap * 3),
          reason: `Keyword overlap with query (${(overlap * 100).toFixed(0)}%)`,
          content: this.fileContents.get(filePath),
        });
      }
    }

    // Sort by relevance
    relatedFiles.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply budget constraints if available
    let totalTokens = 0;
    const budgetedFiles: RankedFile[] = [];
    for (const file of relatedFiles.slice(0, maxFiles)) {
      if (budget && file.content) {
        const tokens = budget.estimateTokens(file.content);
        if (!budget.canFit(tokens)) {
          // Try to fit a truncated version
          const truncated = file.content.slice(
            0,
            Math.floor(file.content.length / 2),
          );
          const truncTokens = budget.estimateTokens(truncated);
          if (budget.canFit(truncTokens)) {
            budget.allocate("multi-file", truncTokens, file.relevanceScore);
            file.content =
              truncated + "\n// ... (truncated for context budget)";
            file.tokenCount = truncTokens;
            totalTokens += truncTokens;
            budgetedFiles.push(file);
          }
          continue;
        }
        budget.allocate("multi-file", tokens, file.relevanceScore);
        file.tokenCount = tokens;
        totalTokens += tokens;
      }
      budgetedFiles.push(file);
    }

    // Build cross-references
    const symbolCrossRefs = this._buildCrossReferences(
      primaryFile,
      budgetedFiles,
    );

    // Build dependency chain
    const dependencyChain = this._buildDependencyChain(primaryFile);

    return {
      primaryFile,
      relatedFiles: budgetedFiles,
      dependencyChain,
      symbolCrossRefs,
      totalTokens,
    };
  }

  /**
   * Analyze the impact of changes to a file.
   */
  analyzeChangeImpact(changedFile: string): ChangeImpact {
    const directDeps = new Set<string>();
    const transitiveDeps = new Set<string>();

    // Find direct dependents
    for (const edge of this.graph.edges) {
      const resolved = this._resolveImportPath(edge.to, edge.from);
      if (resolved === changedFile) {
        directDeps.add(edge.from);
      }
    }

    // Find transitive dependents (BFS)
    const queue = [...directDeps];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of this.graph.edges) {
        const resolved = this._resolveImportPath(edge.to, edge.from);
        if (
          resolved === current &&
          !directDeps.has(edge.from) &&
          !transitiveDeps.has(edge.from)
        ) {
          transitiveDeps.add(edge.from);
          queue.push(edge.from);
        }
      }
    }

    // Affected symbols
    const node = this.graph.nodes.get(changedFile);
    const affectedSymbols = node?.exports.map((e) => e.name) || [];

    // Risk level
    const totalAffected = directDeps.size + transitiveDeps.size;
    let riskLevel: ChangeImpact["riskLevel"] = "low";
    if (totalAffected > 20) riskLevel = "critical";
    else if (totalAffected > 10) riskLevel = "high";
    else if (totalAffected > 3) riskLevel = "medium";

    return {
      changedFile,
      directDependents: [...directDeps],
      transitiveDependents: [...transitiveDeps],
      affectedSymbols,
      riskLevel,
    };
  }

  /**
   * Get the full dependency graph stats.
   */
  getGraphStats() {
    return {
      totalFiles: this.graph.nodes.size,
      totalEdges: this.graph.edges.length,
      roots: this.graph.roots.length,
      leaves: this.graph.leaves.length,
      languages: this._countLanguages(),
      avgImportsPerFile:
        this.graph.edges.length / Math.max(1, this.graph.nodes.size),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private _buildReverseRefs(): void {
    for (const edge of this.graph.edges) {
      const resolved = this._resolveImportPath(edge.to, edge.from);
      if (!resolved) continue;
      const targetNode = this.graph.nodes.get(resolved);
      if (!targetNode) continue;
      for (const sym of edge.symbols) {
        const targetSym = targetNode.symbols.find(
          (s) => s.name === sym || sym === "*",
        );
        if (targetSym && !targetSym.references.includes(edge.from)) {
          targetSym.references.push(edge.from);
        }
      }
    }
  }

  private _classifyRootsLeaves(): void {
    const imported = new Set<string>();
    const importing = new Set<string>();

    for (const edge of this.graph.edges) {
      importing.add(edge.from);
      const resolved = this._resolveImportPath(edge.to, edge.from);
      if (resolved) imported.add(resolved);
    }

    this.graph.roots = [...this.graph.nodes.keys()].filter(
      (f) => !imported.has(f),
    );
    this.graph.leaves = [...this.graph.nodes.keys()].filter(
      (f) => !importing.has(f),
    );
  }

  private _resolveImportPath(
    importPath: string,
    fromFile: string,
  ): string | null {
    // Relative imports
    if (importPath.startsWith(".")) {
      const fromDir = fromFile.split("/").slice(0, -1).join("/");
      const resolved = this._normalizePath(fromDir + "/" + importPath);
      // Try with extensions
      const extensions = [
        "",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        "/index.ts",
        "/index.js",
      ];
      for (const ext of extensions) {
        if (this.graph.nodes.has(resolved + ext)) return resolved + ext;
      }
      return resolved;
    }
    // Package imports — check if it matches any node path suffix
    for (const nodePath of this.graph.nodes.keys()) {
      if (
        nodePath.endsWith(importPath) ||
        nodePath.endsWith(importPath + ".ts") ||
        nodePath.endsWith(importPath + ".js")
      ) {
        return nodePath;
      }
    }
    return null; // external package
  }

  private _normalizePath(p: string): string {
    const parts = p.split("/");
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "..") resolved.pop();
      else if (part !== ".") resolved.push(part);
    }
    return resolved.join("/");
  }

  private _buildCrossReferences(
    primaryFile: string,
    relatedFiles: RankedFile[],
  ): CrossReference[] {
    const refs: CrossReference[] = [];
    const primaryNode = this.graph.nodes.get(primaryFile);
    if (!primaryNode) return refs;

    for (const sym of primaryNode.symbols) {
      if (sym.references.length > 0) {
        refs.push({
          symbol: sym.name,
          definedIn: primaryFile,
          usedIn: sym.references.filter((r) =>
            relatedFiles.some((f) => f.relativePath === r),
          ),
          kind: sym.kind,
        });
      }
    }

    return refs;
  }

  private _buildDependencyChain(startFile: string, maxDepth = 5): string[] {
    const chain: string[] = [startFile];
    const visited = new Set<string>([startFile]);
    let frontier = [startFile];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      for (const file of frontier) {
        const node = this.graph.nodes.get(file);
        if (!node) continue;
        for (const imp of node.imports) {
          const resolved = this._resolveImportPath(imp.to, file);
          if (resolved && !visited.has(resolved)) {
            visited.add(resolved);
            chain.push(resolved);
            nextFrontier.push(resolved);
          }
        }
      }
      frontier = nextFrontier;
    }

    return chain;
  }

  private _extractKeywords(text: string): Set<string> {
    const STOP = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "as",
      "this",
      "that",
      "it",
      "and",
      "but",
      "or",
      "not",
      "if",
      "import",
      "export",
      "const",
      "let",
      "var",
      "function",
      "class",
      "return",
      "new",
      "true",
      "false",
      "null",
      "undefined",
    ]);
    const tokens = text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter(Boolean);
    const kw = new Set<string>();
    for (const t of tokens) {
      if (t.length >= 3 && !STOP.has(t)) kw.add(t);
    }
    return kw;
  }

  private _keywordOverlap(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const w of a) {
      if (b.has(w)) intersection++;
    }
    return intersection / (a.size + b.size - intersection);
  }

  private _countLanguages(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const node of this.graph.nodes.values()) {
      counts[node.language] = (counts[node.language] || 0) + 1;
    }
    return counts;
  }
}
