/**
 * Repo Intelligence — Barrel export
 *
 * Central entry point for the repo-intelligence subsystem.
 */
"use strict";

const {
  walkRepo,
  readFileContent,
  detectLanguage,
  isBinaryFile,
  parseGitignore,
} = require("./file-walker");
const {
  extractImports,
  extractExports,
  extractSymbols,
  buildDependencyGraph,
  resolveSpecifier,
  analyzeChangeImpact,
  rankFilesByRelevance,
} = require("./symbol-extractor");
const { RepoIndex } = require("./repo-index");
const {
  RefactorPlanner,
  extractQueryTerms,
  topoSortFiles,
} = require("./refactor-planner");
const {
  ValidationPipeline,
  detectProjectType,
} = require("./validation-pipeline");
const {
  RefactorExecutor,
  parseMultiFileResponse,
  cleanCodeResponse,
} = require("./refactor-executor");
const {
  buildAstSymbolGraph,
  getCallersOfSymbol,
  isAstCapableLanguage,
} = require("./ast-symbol-graph");
const {
  EmbeddingIndex,
  embedText,
  cosineSimilarity,
  tokenize,
} = require("./embedding-index");

module.exports = {
  // File Walker
  walkRepo,
  readFileContent,
  detectLanguage,
  isBinaryFile,
  parseGitignore,

  // Symbol Extractor
  extractImports,
  extractExports,
  extractSymbols,
  buildDependencyGraph,
  resolveSpecifier,
  analyzeChangeImpact,
  rankFilesByRelevance,

  // Repo Index
  RepoIndex,

  // Refactor Planner
  RefactorPlanner,
  extractQueryTerms,
  topoSortFiles,

  // Validation Pipeline
  ValidationPipeline,
  detectProjectType,

  // Refactor Executor
  RefactorExecutor,
  parseMultiFileResponse,
  cleanCodeResponse,

  // AST Symbol Graph
  buildAstSymbolGraph,
  getCallersOfSymbol,
  isAstCapableLanguage,

  // Embeddings
  EmbeddingIndex,
  embedText,
  cosineSimilarity,
  tokenize,
};
