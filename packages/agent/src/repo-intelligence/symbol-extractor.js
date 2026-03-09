/**
 * Repo Intelligence — Symbol Extractor & Dependency Graph
 *
 * Regex-based import/export parsing + symbol extraction for JS/TS/Python/Go/Rust/Java/C#.
 * Builds a file-level dependency graph and extracts top-level declarations.
 * Pure CJS — no tree-sitter dependency.
 *
 * Usage:
 *   const { extractSymbols, buildDependencyGraph } = require('./symbol-extractor');
 *   const symbols = await extractSymbols(filePath, source, 'typescript');
 *   const graph = await buildDependencyGraph(fileMap);
 */
"use strict";

const path = require("node:path");

// ─── Import Patterns ─────────────────────────────────────────────────────────

/**
 * Extract import/require references from source code.
 * Returns raw module specifiers (not resolved file paths).
 */
function extractImports(source, language) {
  const imports = [];

  switch (language) {
    case "javascript":
    case "typescript": {
      // ES imports: import X from 'mod', import { X } from 'mod'
      const esFromRe = /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
      let m;
      while ((m = esFromRe.exec(source)) !== null) imports.push(m[1]);

      // Bare side-effect imports: import 'mod'
      const bareSideRe = /import\s+['"]([^'"]+)['"]/g;
      while ((m = bareSideRe.exec(source)) !== null) imports.push(m[1]);

      // Dynamic import: import('mod')
      const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((m = dynRe.exec(source)) !== null) imports.push(m[1]);

      // CJS require: require('mod')
      const cjsRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((m = cjsRe.exec(source)) !== null) imports.push(m[1]);

      // Re-exports: export { X } from 'mod'
      const reExRe = /export\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/g;
      while ((m = reExRe.exec(source)) !== null) imports.push(m[1]);

      // export * from 'mod'
      const starRe = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
      while ((m = starRe.exec(source)) !== null) imports.push(m[1]);
      break;
    }

    case "python": {
      // import mod / import mod.sub
      const impRe = /^import\s+([\w.]+)/gm;
      let m;
      while ((m = impRe.exec(source)) !== null) imports.push(m[1]);

      // from mod import X
      const fromRe = /^from\s+([\w.]+)\s+import/gm;
      while ((m = fromRe.exec(source)) !== null) imports.push(m[1]);
      break;
    }

    case "go": {
      // Single import: import "pkg"
      const singleRe = /import\s+"([^"]+)"/g;
      let m;
      while ((m = singleRe.exec(source)) !== null) imports.push(m[1]);

      // Group import: import ( "pkg1" \n "pkg2" )
      const groupRe = /import\s*\(([\s\S]*?)\)/g;
      while ((m = groupRe.exec(source)) !== null) {
        const inner = m[1];
        const pkgRe = /"([^"]+)"/g;
        let p;
        while ((p = pkgRe.exec(inner)) !== null) imports.push(p[1]);
      }
      break;
    }

    case "rust": {
      // use crate::module; use std::io;
      const useRe = /\buse\s+([\w:]+)/g;
      let m;
      while ((m = useRe.exec(source)) !== null) imports.push(m[1]);

      // mod module_name;
      const modRe = /\bmod\s+(\w+)\s*;/g;
      while ((m = modRe.exec(source)) !== null) imports.push(m[1]);
      break;
    }

    case "java":
    case "kotlin":
    case "scala": {
      const jRe = /^import\s+([\w.]+)/gm;
      let m;
      while ((m = jRe.exec(source)) !== null) imports.push(m[1]);
      break;
    }

    case "csharp": {
      const csRe = /^using\s+([\w.]+)\s*;/gm;
      let m;
      while ((m = csRe.exec(source)) !== null) imports.push(m[1]);
      break;
    }

    case "ruby": {
      const rbRe = /\brequire(?:_relative)?\s+['"]([^'"]+)['"]/g;
      let m;
      while ((m = rbRe.exec(source)) !== null) imports.push(m[1]);
      break;
    }

    case "php": {
      const phpRe = /\b(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]/g;
      let m;
      while ((m = phpRe.exec(source)) !== null) imports.push(m[1]);

      const useRe = /\buse\s+([\w\\]+)/g;
      while ((m = useRe.exec(source)) !== null) imports.push(m[1]);
      break;
    }

    default: {
      // Attempt generic import/require detection
      const genRe = /(?:import|require|include)\s*\(?['"]([^'"]+)['"]\)?/g;
      let m;
      while ((m = genRe.exec(source)) !== null) imports.push(m[1]);
    }
  }

  return [...new Set(imports)];
}

// ─── Export Patterns ─────────────────────────────────────────────────────────

/**
 * Extract export names from source code.
 */
function extractExports(source, language) {
  const exports = [];

  switch (language) {
    case "javascript":
    case "typescript": {
      // export default X
      const defRe =
        /export\s+default\s+(?:class|function\*?|const|let|var)?\s*(\w+)?/g;
      let m;
      while ((m = defRe.exec(source)) !== null) {
        exports.push({ name: m[1] || "default", kind: "default" });
      }

      // export const/let/var X
      const namedRe = /export\s+(?:const|let|var)\s+(\w+)/g;
      while ((m = namedRe.exec(source)) !== null) {
        exports.push({ name: m[1], kind: "variable" });
      }

      // export function X / export class X
      const fnClsRe = /export\s+(function\*?|class)\s+(\w+)/g;
      while ((m = fnClsRe.exec(source)) !== null) {
        exports.push({
          name: m[2],
          kind: m[1].startsWith("function") ? "function" : "class",
        });
      }

      // export { A, B, C }
      const bracketRe = /export\s+\{([^}]+)\}/g;
      while ((m = bracketRe.exec(source)) !== null) {
        const inner = m[1];
        for (const tok of inner.split(",")) {
          const nm = tok
            .trim()
            .split(/\s+as\s+/)[0]
            .trim();
          if (nm) exports.push({ name: nm, kind: "named" });
        }
      }

      // module.exports = X  /  module.exports.X = ...  /  exports.X = ...
      const cjsRe = /(?:module\.)?exports\.(\w+)\s*=/g;
      while ((m = cjsRe.exec(source)) !== null) {
        exports.push({ name: m[1], kind: "cjs" });
      }

      // module.exports = { A, B }
      const cjsObjRe = /module\.exports\s*=\s*\{([^}]+)\}/g;
      while ((m = cjsObjRe.exec(source)) !== null) {
        for (const tok of m[1].split(",")) {
          const nm = tok.trim().split(/\s*:/)[0].trim();
          if (nm && /^\w+$/.test(nm)) exports.push({ name: nm, kind: "cjs" });
        }
      }

      // export type / export interface (TS)
      if (language === "typescript") {
        const typeRe = /export\s+(?:type|interface|enum)\s+(\w+)/g;
        while ((m = typeRe.exec(source)) !== null) {
          exports.push({ name: m[1], kind: "type" });
        }
      }
      break;
    }

    case "python": {
      // __all__ = ['A', 'B']
      const allRe = /__all__\s*=\s*\[([^\]]+)\]/;
      const allMatch = allRe.exec(source);
      if (allMatch) {
        const items = allMatch[1].match(/['"](\w+)['"]/g) || [];
        for (const item of items) {
          exports.push({ name: item.replace(/['"]/g, ""), kind: "named" });
        }
      }

      // Top-level def and class
      const defRe = /^(def|class)\s+(\w+)/gm;
      let m;
      while ((m = defRe.exec(source)) !== null) {
        if (!m[2].startsWith("_")) {
          exports.push({
            name: m[2],
            kind: m[1] === "def" ? "function" : "class",
          });
        }
      }
      break;
    }

    case "go": {
      // Exported = starts with uppercase
      const fnRe = /^func\s+(?:\(.*?\)\s+)?([A-Z]\w*)/gm;
      let m;
      while ((m = fnRe.exec(source)) !== null) {
        exports.push({ name: m[1], kind: "function" });
      }
      const typeRe = /^type\s+([A-Z]\w*)/gm;
      while ((m = typeRe.exec(source)) !== null) {
        exports.push({ name: m[1], kind: "type" });
      }
      break;
    }

    case "rust": {
      const pubRe =
        /\bpub\s+(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/g;
      let m;
      while ((m = pubRe.exec(source)) !== null) {
        exports.push({ name: m[1], kind: "public" });
      }
      break;
    }

    case "java":
    case "kotlin":
    case "csharp": {
      const pubRe =
        /\bpublic\s+(?:static\s+)?(?:class|interface|enum|record|void|int|string|boolean|long|double|float|var|val|fun)\s+(\w+)/g;
      let m;
      while ((m = pubRe.exec(source)) !== null) {
        exports.push({ name: m[1], kind: "public" });
      }
      break;
    }

    default:
      break;
  }

  return exports;
}

// ─── Symbol Extraction ──────────────────────────────────────────────────────

/**
 * @typedef {Object} Symbol
 * @property {string} name
 * @property {'function'|'class'|'variable'|'type'|'interface'|'method'|'constant'|'default'|'named'|'cjs'|'public'} kind
 * @property {number} line - 1-indexed line number
 * @property {number} [endLine]
 */

/**
 * Extract top-level symbol declarations.
 * @param {string} source
 * @param {string} language
 * @returns {Symbol[]}
 */
function extractSymbols(source, language) {
  const symbols = [];
  const lines = source.split("\n");

  switch (language) {
    case "javascript":
    case "typescript": {
      const patterns = [
        {
          re: /^(?:export\s+)?(?:async\s+)?function\*?\s+(\w+)/,
          kind: "function",
        },
        { re: /^(?:export\s+)?class\s+(\w+)/, kind: "class" },
        {
          re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/,
          kind: "variable",
        },
        { re: /^(?:export\s+)?interface\s+(\w+)/, kind: "interface" },
        { re: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: "type" },
        { re: /^(?:export\s+)?enum\s+(\w+)/, kind: "type" },
      ];
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        for (const { re, kind } of patterns) {
          const m = re.exec(trimmed);
          if (m) {
            symbols.push({ name: m[1], kind, line: i + 1 });
            break;
          }
        }
      }
      break;
    }

    case "python": {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Only top-level (no leading whitespace)
        if (/^\s/.test(line)) continue;
        const fnMatch = /^def\s+(\w+)/.exec(line);
        if (fnMatch) {
          symbols.push({ name: fnMatch[1], kind: "function", line: i + 1 });
          continue;
        }
        const clsMatch = /^class\s+(\w+)/.exec(line);
        if (clsMatch) {
          symbols.push({ name: clsMatch[1], kind: "class", line: i + 1 });
          continue;
        }
        const varMatch = /^([A-Z_][A-Z0-9_]*)\s*=/.exec(line);
        if (varMatch) {
          symbols.push({ name: varMatch[1], kind: "constant", line: i + 1 });
        }
      }
      break;
    }

    case "go": {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fnMatch = /^func\s+(?:\(.*?\)\s+)?(\w+)/.exec(line);
        if (fnMatch) {
          symbols.push({ name: fnMatch[1], kind: "function", line: i + 1 });
          continue;
        }
        const typeMatch = /^type\s+(\w+)/.exec(line);
        if (typeMatch) {
          symbols.push({ name: typeMatch[1], kind: "type", line: i + 1 });
          continue;
        }
        const varMatch = /^var\s+(\w+)/.exec(line);
        if (varMatch) {
          symbols.push({ name: varMatch[1], kind: "variable", line: i + 1 });
        }
      }
      break;
    }

    case "rust": {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fnMatch = /^\s*(?:pub\s+)?fn\s+(\w+)/.exec(line);
        if (fnMatch) {
          symbols.push({ name: fnMatch[1], kind: "function", line: i + 1 });
          continue;
        }
        const strMatch = /^\s*(?:pub\s+)?struct\s+(\w+)/.exec(line);
        if (strMatch) {
          symbols.push({ name: strMatch[1], kind: "type", line: i + 1 });
          continue;
        }
        const enumMatch = /^\s*(?:pub\s+)?enum\s+(\w+)/.exec(line);
        if (enumMatch) {
          symbols.push({ name: enumMatch[1], kind: "type", line: i + 1 });
          continue;
        }
        const traitMatch = /^\s*(?:pub\s+)?trait\s+(\w+)/.exec(line);
        if (traitMatch) {
          symbols.push({ name: traitMatch[1], kind: "interface", line: i + 1 });
        }
      }
      break;
    }

    case "java":
    case "kotlin":
    case "csharp": {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const clsMatch =
          /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:abstract\s+)?(?:class|interface|enum|record|object)\s+(\w+)/.exec(
            line,
          );
        if (clsMatch) {
          symbols.push({ name: clsMatch[1], kind: "class", line: i + 1 });
          continue;
        }
        const fnMatch =
          /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:fun|void|int|string|boolean|Task|List|Set|Map|var|val|dynamic)\s+(\w+)\s*\(/.exec(
            line,
          );
        if (fnMatch) {
          symbols.push({ name: fnMatch[1], kind: "function", line: i + 1 });
        }
      }
      break;
    }

    default: {
      // Generic: look for function/class/def patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match =
          /(?:function|class|def|fn|func|sub|procedure)\s+(\w+)/.exec(line);
        if (match)
          symbols.push({ name: match[1], kind: "function", line: i + 1 });
      }
    }
  }

  return symbols;
}

// ─── Dependency Graph ────────────────────────────────────────────────────────

/**
 * Resolve a module specifier to a file in the project.
 * Handles relative paths (./ ../) and attempts bare specifier resolution.
 *
 * @param {string} specifier - The raw import specifier
 * @param {string} fromFile - Relative path of the importing file
 * @param {Map<string,Object>} fileMap - Map<relativePath, fileInfo>
 * @returns {string|null} Resolved relativePath or null
 */
function resolveSpecifier(specifier, fromFile, fileMap) {
  // Only resolve relative imports
  if (!specifier.startsWith(".")) return null;

  const fromDir = path.posix.dirname(fromFile);
  let resolved = path.posix.normalize(path.posix.join(fromDir, specifier));

  // Try exact match
  if (fileMap.has(resolved)) return resolved;

  // Try common extensions
  const exts = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    ".py",
    ".go",
    ".rs",
  ];
  for (const ext of exts) {
    if (fileMap.has(resolved + ext)) return resolved + ext;
  }

  // Try index files
  for (const ext of exts) {
    const idx = resolved + "/index" + ext;
    if (fileMap.has(idx)) return idx;
  }

  return null;
}

/**
 * @typedef {Object} DependencyEdge
 * @property {string} from - relativePath of importer
 * @property {string} to - relativePath of imported
 * @property {string} specifier - Raw module specifier
 */

/**
 * Build a file-level dependency graph from a set of analyzed files.
 *
 * @param {Map<string, { relativePath: string, language: string, source: string }>} fileMap
 * @returns {{ edges: DependencyEdge[], adjacency: Map<string, string[]>, reverseAdjacency: Map<string, string[]> }}
 */
function buildDependencyGraph(fileMap) {
  const edges = [];
  const adjacency = new Map(); // file → [files it imports]
  const reverseAdjacency = new Map(); // file → [files that import it]

  for (const [relPath, info] of fileMap) {
    const rawImports = extractImports(info.source, info.language);
    const deps = [];

    for (const specifier of rawImports) {
      const resolvedTarget = resolveSpecifier(specifier, relPath, fileMap);
      if (resolvedTarget) {
        edges.push({ from: relPath, to: resolvedTarget, specifier });
        deps.push(resolvedTarget);

        // Reverse adjacency
        if (!reverseAdjacency.has(resolvedTarget)) {
          reverseAdjacency.set(resolvedTarget, []);
        }
        reverseAdjacency.get(resolvedTarget).push(relPath);
      }
    }

    adjacency.set(relPath, deps);
  }

  return { edges, adjacency, reverseAdjacency };
}

// ─── Change Impact Analysis ─────────────────────────────────────────────────

/**
 * Given a set of changed files, compute the transitive set of impacted files
 * (all files that directly or transitively depend on the changed files).
 *
 * @param {string[]} changedFiles - relativePaths of files that changed
 * @param {Map<string, string[]>} reverseAdjacency - file → importers
 * @param {number} [maxDepth=10] - Max traversal depth to prevent infinite loops
 * @returns {{ directlyImpacted: string[], transitivelyImpacted: string[] }}
 */
function analyzeChangeImpact(changedFiles, reverseAdjacency, maxDepth = 10) {
  const directlyImpacted = new Set();
  const transitivelyImpacted = new Set();

  // Direct dependents
  for (const file of changedFiles) {
    const importers = reverseAdjacency.get(file) || [];
    for (const imp of importers) {
      directlyImpacted.add(imp);
    }
  }

  // BFS for transitive impact
  const visited = new Set(changedFiles);
  let frontier = [...changedFiles];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    const nextFrontier = [];
    for (const file of frontier) {
      const importers = reverseAdjacency.get(file) || [];
      for (const imp of importers) {
        if (!visited.has(imp)) {
          visited.add(imp);
          transitivelyImpacted.add(imp);
          nextFrontier.push(imp);
        }
      }
    }
    frontier = nextFrontier;
    depth++;
  }

  return {
    directlyImpacted: [...directlyImpacted],
    transitivelyImpacted: [...transitivelyImpacted],
  };
}

/**
 * Rank files by relevance to a query/topic.
 * Uses simple TF-IDF-like keyword scoring.
 *
 * @param {string[]} queryTerms - Keywords to search for
 * @param {Map<string, { relativePath: string, source: string, language: string }>} fileMap
 * @param {Map<string, string[]>} reverseAdjacency
 * @param {number} [topK=20]
 * @returns {{ relativePath: string, score: number, reason: string }[]}
 */
function rankFilesByRelevance(
  queryTerms,
  fileMap,
  reverseAdjacency,
  topK = 20,
) {
  const scores = [];
  const N = fileMap.size || 1;

  // Document frequency of each term
  const df = new Map();
  for (const term of queryTerms) {
    let count = 0;
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "gi");
    for (const [, info] of fileMap) {
      if (re.test(info.source) || re.test(info.relativePath)) count++;
      re.lastIndex = 0;
    }
    df.set(term, count);
  }

  for (const [relPath, info] of fileMap) {
    let score = 0;
    const reasons = [];
    const srcLower = info.source.toLowerCase();
    const pathLower = relPath.toLowerCase();

    for (const term of queryTerms) {
      const termLower = term.toLowerCase();
      const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "gi");

      // Term frequency in source
      const matches = info.source.match(re) || [];
      const tf = matches.length;

      // IDF
      const docFreq = df.get(term) || 1;
      const idf = Math.log(N / docFreq);

      const termScore = tf * idf;
      if (termScore > 0) {
        score += termScore;
        reasons.push(`${term}:${tf}`);
      }

      // Path match bonus
      if (pathLower.includes(termLower)) {
        score += 5;
        reasons.push(`path:${term}`);
      }
    }

    // Dependency centrality bonus (more importers = more important)
    const importerCount = (reverseAdjacency.get(relPath) || []).length;
    if (importerCount > 0) {
      score += Math.log(1 + importerCount) * 2;
    }

    if (score > 0) {
      scores.push({ relativePath: relPath, score, reason: reasons.join(", ") });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  extractImports,
  extractExports,
  extractSymbols,
  buildDependencyGraph,
  resolveSpecifier,
  analyzeChangeImpact,
  rankFilesByRelevance,
};
