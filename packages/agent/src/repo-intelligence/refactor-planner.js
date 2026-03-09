/**
 * Repo Intelligence — Refactor Planner
 *
 * Given a refactoring goal (e.g. "rename UserService to AccountService",
 * "extract method foo from Bar class"), this module:
 *
 *  1. Queries the RepoIndex to find all relevant files
 *  2. Analyzes the dependency graph for impact propagation
 *  3. Generates an ordered plan of file edits
 *  4. Produces LLM prompts for each edit step
 *
 * The plan is designed to be executed safely: edits proceed in topological
 * dependency order so that leaf files are changed before files that import them.
 *
 * Pure CJS, no core/ deps.
 */
"use strict";

const { logger } = require("../logger");

// ─── Refactor Types ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} EditStep
 * @property {number} order - Execution order (0-indexed)
 * @property {string} relativePath
 * @property {string} action - 'modify' | 'create' | 'delete' | 'rename'
 * @property {string} reason - Human-readable explanation
 * @property {string[]} searchTerms - Terms to find the relevant code sections
 * @property {Object} [context] - Additional context for the LLM
 */

/**
 * @typedef {Object} RefactorPlan
 * @property {string} id
 * @property {string} goal
 * @property {string} strategy - 'rename' | 'extract' | 'move' | 'inline' | 'restructure' | 'generic'
 * @property {EditStep[]} steps
 * @property {string[]} impactedFiles
 * @property {string[]} risks
 * @property {number} estimatedFiles
 */

// ─── Strategy Detection ─────────────────────────────────────────────────────

const STRATEGY_PATTERNS = [
  { strategy: "rename", re: /\brename\b/i },
  { strategy: "extract", re: /\bextract\b/i },
  { strategy: "move", re: /\bmove\b/i },
  { strategy: "inline", re: /\binline\b/i },
  { strategy: "delete", re: /\bdelete\b|\bremove\b/i },
  {
    strategy: "restructure",
    re: /\brestructure\b|\breorganize\b|\brefactor\b/i,
  },
];

function detectStrategy(goal) {
  for (const { strategy, re } of STRATEGY_PATTERNS) {
    if (re.test(goal)) return strategy;
  }
  return "generic";
}

// ─── Topological Sort ───────────────────────────────────────────────────────

/**
 * Topological sort of files so leaves (no dependents) come first.
 * This ensures we edit downstream files before upstream consumers.
 *
 * Falls back to a stable alphabetical order if the graph has cycles.
 */
function topoSortFiles(files, adjacency) {
  const inDegree = new Map();
  const fileSet = new Set(files);

  // Initialize in-degree for all files
  for (const f of files) inDegree.set(f, 0);

  // Count in-degree within the subset
  for (const f of files) {
    const deps = adjacency.get(f) || [];
    for (const dep of deps) {
      if (fileSet.has(dep)) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue = [];
  for (const [f, deg] of inDegree) {
    if (deg === 0) queue.push(f);
  }
  queue.sort();

  const sorted = [];
  while (queue.length > 0) {
    const f = queue.shift();
    sorted.push(f);
    const deps = adjacency.get(f) || [];
    for (const dep of deps) {
      if (!fileSet.has(dep)) continue;
      const newDeg = (inDegree.get(dep) || 1) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  // If graph has cycles, append remaining files alphabetically
  if (sorted.length < files.length) {
    const remaining = files.filter((f) => !sorted.includes(f));
    remaining.sort();
    sorted.push(...remaining);
  }

  return sorted;
}

// ─── Planner ────────────────────────────────────────────────────────────────

class RefactorPlanner {
  /**
   * @param {import('./repo-index').RepoIndex} repoIndex
   */
  constructor(repoIndex) {
    this.repoIndex = repoIndex;
  }

  /**
   * Generate a refactor plan from a natural-language goal.
   *
   * @param {string} goal - e.g. "Rename UserService to AccountService across all files"
   * @param {Object} [opts]
   * @param {string[]} [opts.targetFiles] - Explicit files to include (optional)
   * @param {string[]} [opts.excludeFiles] - Files to never touch
   * @param {number} [opts.maxFiles=30] - Max files to include in the plan
   * @returns {RefactorPlan}
   */
  plan(goal, opts = {}) {
    const id = `refactor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const strategy = detectStrategy(goal);
    const maxFiles = opts.maxFiles ?? 30;
    const excludeSet = new Set(opts.excludeFiles || []);

    logger.info("RefactorPlanner: creating plan", { id, goal, strategy });

    // Extract key terms from the goal for search
    const queryTerms = extractQueryTerms(goal);

    // Find relevant files
    let relevantFiles;
    if (opts.targetFiles && opts.targetFiles.length > 0) {
      // Explicit targets + their impacts
      const impact = this.repoIndex.getChangeImpact(opts.targetFiles);
      relevantFiles = [
        ...opts.targetFiles,
        ...impact.directlyImpacted,
        ...impact.transitivelyImpacted.slice(
          0,
          maxFiles - opts.targetFiles.length,
        ),
      ];
    } else {
      // Search-based discovery
      const searchResults = this.repoIndex.search(queryTerms, maxFiles * 2);
      const primary = searchResults
        .slice(0, Math.min(5, maxFiles))
        .map((r) => r.relativePath);
      const impact = this.repoIndex.getChangeImpact(primary);
      relevantFiles = [...primary, ...impact.directlyImpacted];
    }

    // Deduplicate + filter
    relevantFiles = [...new Set(relevantFiles)]
      .filter((f) => !excludeSet.has(f))
      .slice(0, maxFiles);

    // Topological ordering
    const sortedFiles = topoSortFiles(
      relevantFiles,
      this.repoIndex.graph.adjacency,
    );

    // Generate edit steps
    const steps = sortedFiles.map((file, idx) => {
      const info = this.repoIndex.getFile(file);
      const deps = this.repoIndex.getDependencies(file);
      const dependents = this.repoIndex.getDependents(file);

      return {
        order: idx,
        relativePath: file,
        action: "modify",
        reason: this._generateReason(strategy, file, queryTerms, info),
        searchTerms: queryTerms,
        context: {
          language: info?.language || "unknown",
          lineCount: info?.lineCount || 0,
          symbols: (info?.symbols || [])
            .map((s) => `${s.kind}:${s.name}`)
            .join(", "),
          imports: deps.slice(0, 10),
          dependents: dependents.slice(0, 10),
          importsRaw: (info?.imports || []).slice(0, 20),
          exportsRaw: (info?.exports || []).map((e) => e.name).slice(0, 20),
        },
      };
    });

    // Risk analysis
    const risks = this._analyzeRisks(strategy, sortedFiles);

    const plan = {
      id,
      goal,
      strategy,
      steps,
      impactedFiles: sortedFiles,
      risks,
      estimatedFiles: sortedFiles.length,
    };

    logger.info("RefactorPlanner: plan created", {
      id,
      strategy,
      files: sortedFiles.length,
      steps: steps.length,
      risks: risks.length,
    });

    return plan;
  }

  /**
   * Generate an LLM prompt for executing a specific edit step.
   *
   * @param {RefactorPlan} plan
   * @param {EditStep} step
   * @returns {{ systemPrompt: string, userPrompt: string }}
   */
  generateEditPrompt(plan, step) {
    const fileInfo = this.repoIndex.getFile(step.relativePath);
    const source = fileInfo?.source || "";

    const systemPrompt = `You are an expert code refactoring engine. You MUST output ONLY the complete modified file content — no explanations, no markdown fences, no commentary.

Rules:
- Preserve all existing functionality unless the refactoring goal explicitly requires changes.
- Maintain the same code style, indentation, and formatting.
- Update all references (imports, exports, type annotations, comments, strings) consistently.
- Do NOT introduce new bugs. Do NOT change logic unless explicitly required.
- If a file requires no changes, output it unchanged.`;

    const dependencyContext =
      step.context.imports.length > 0
        ? `\nThis file imports from: ${step.context.imports.join(", ")}`
        : "";

    const dependentContext =
      step.context.dependents.length > 0
        ? `\nFiles that import this file: ${step.context.dependents.join(", ")}`
        : "";

    const userPrompt = `REFACTORING GOAL: ${plan.goal}

STRATEGY: ${plan.strategy}
FILE: ${step.relativePath} (${step.context.language}, ${step.context.lineCount} lines)
STEP ${step.order + 1} of ${plan.steps.length}: ${step.reason}

SYMBOLS IN FILE: ${step.context.symbols || "none detected"}
EXPORTS: ${step.context.exportsRaw?.join(", ") || "none"}
${dependencyContext}${dependentContext}

CURRENT FILE CONTENT:
${source}

Output the complete modified file content:`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Generate a consolidated LLM prompt for multi-file refactoring
   * (when the total is small enough to fit in one prompt).
   *
   * @param {RefactorPlan} plan
   * @param {number} [maxContextTokens=12000]
   * @returns {{ systemPrompt: string, userPrompt: string, files: string[] }}
   */
  generateConsolidatedPrompt(plan, maxContextTokens = 12000) {
    const systemPrompt = `You are an expert multi-file code refactoring engine. Apply the requested refactoring across ALL provided files simultaneously.

Output format: For each file that needs changes, output:
===FILE: <relative_path>===
<complete file content>
===END_FILE===

Rules:
- Output EVERY file that needs changes (skip unchanged files).
- Each file must contain the COMPLETE content (not a diff).
- Maintain consistency across all files.
- Update all cross-file references.
- Preserve code style and formatting.`;

    const maxChars = maxContextTokens * 4;
    let totalChars = 0;
    const fileContents = [];
    const includedFiles = [];

    for (const step of plan.steps) {
      const info = this.repoIndex.getFile(step.relativePath);
      if (!info) continue;
      const content = info.source;
      if (totalChars + content.length > maxChars) break;
      fileContents.push(
        `--- ${step.relativePath} (${step.context.language}) ---\n${content}`,
      );
      includedFiles.push(step.relativePath);
      totalChars += content.length;
    }

    const userPrompt = `REFACTORING GOAL: ${plan.goal}

STRATEGY: ${plan.strategy}
TOTAL FILES: ${plan.steps.length}
FILES INCLUDED BELOW: ${includedFiles.length}

${fileContents.join("\n\n")}

Apply the refactoring to all files. Output each changed file in the specified format.`;

    return { systemPrompt, userPrompt, files: includedFiles };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  _generateReason(strategy, file, terms, info) {
    switch (strategy) {
      case "rename":
        return `Update references to renamed symbols (${terms.join(", ")}) in ${file}`;
      case "extract":
        return `Extract targeted code from ${file} into new module`;
      case "move":
        return `Update imports/references after moving code involving ${terms.join(", ")}`;
      case "inline":
        return `Inline abstraction and update ${file}`;
      case "delete":
        return `Remove references to deleted code in ${file}`;
      case "restructure":
        return `Restructure code organization in ${file}`;
      default:
        return `Apply refactoring (${terms.join(", ")}) to ${file}`;
    }
  }

  _analyzeRisks(strategy, files) {
    const risks = [];

    if (files.length > 20) {
      risks.push(
        "LARGE_SCOPE: Refactoring touches >20 files — high risk of inconsistency",
      );
    }

    if (files.length > 50) {
      risks.push(
        "VERY_LARGE_SCOPE: >50 files — consider breaking into smaller refactors",
      );
    }

    // Check for important/central files
    for (const file of files) {
      const dependents = this.repoIndex.getDependents(file);
      if (dependents.length > 10) {
        risks.push(
          `HIGH_IMPACT: ${file} has ${dependents.length} dependents — changes will cascade widely`,
        );
      }
    }

    // Test files affected
    const testFiles = files.filter(
      (f) =>
        f.includes("test") || f.includes("spec") || f.includes("__tests__"),
    );
    if (testFiles.length === 0 && files.length > 3) {
      risks.push(
        "NO_TESTS: No test files in scope — cannot verify correctness automatically",
      );
    }

    // Config files
    const configFiles = files.filter(
      (f) =>
        f.endsWith(".json") ||
        f.endsWith(".yaml") ||
        f.endsWith(".yml") ||
        f.endsWith(".toml"),
    );
    if (configFiles.length > 0) {
      risks.push(
        `CONFIG_CHANGES: ${configFiles.length} config file(s) affected — verify manually`,
      );
    }

    return risks;
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Extract meaningful search terms from a natural-language refactoring goal.
 * Filters out stop words, keeps identifiers and technical terms.
 */
function extractQueryTerms(goal) {
  const STOP_WORDS = new Set([
    "a",
    "an",
    "the",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "and",
    "or",
    "but",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
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
    "may",
    "might",
    "shall",
    "can",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "not",
    "only",
    "same",
    "than",
    "too",
    "very",
    "just",
    "across",
    "into",
    "from",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "i",
    "we",
    "they",
    "them",
    "my",
    "our",
    "your",
    "his",
    "her",
    "their",
    "rename",
    "refactor",
    "extract",
    "move",
    "inline",
    "delete",
    "remove",
    "update",
    "change",
    "modify",
    "fix",
    "replace",
    "file",
    "files",
    "code",
    "function",
    "class",
    "method",
    "variable",
    "module",
    "import",
    "export",
  ]);

  // Split on word boundaries, filter stop words, keep identifiers
  const tokens = goal
    .split(/[\s,;:'"()\[\]{}]+/)
    .map((t) => t.replace(/[^a-zA-Z0-9_$]/g, ""))
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t.toLowerCase()));

  // Also detect CamelCase / snake_case identifiers (keep them whole)
  const identifiers =
    goal.match(/[A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)*/g) || [];
  const snakeIds = goal.match(/[a-z]+(?:_[a-z]+)+/g) || [];

  return [...new Set([...tokens, ...identifiers, ...snakeIds])];
}

module.exports = { RefactorPlanner, extractQueryTerms, topoSortFiles };
