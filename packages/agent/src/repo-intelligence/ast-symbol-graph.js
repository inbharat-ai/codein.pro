/**
 * Repo Intelligence - AST Symbol Graph
 *
 * Builds symbol and call relationships with TypeScript compiler AST when available.
 * Falls back safely if the compiler API is unavailable.
 */
"use strict";

let ts = null;
try {
  ts = require("typescript");
} catch {
  ts = null;
}

function isAstCapableLanguage(language) {
  return language === "javascript" || language === "typescript";
}

function createGraph() {
  return {
    enabled: !!ts,
    parser: ts ? "typescript" : "none",
    filesProcessed: 0,
    symbolNodes: [],
    callEdges: [],
    importEdges: [],
    byFile: {},
  };
}

function buildAstSymbolGraph(fileMap) {
  const graph = createGraph();
  if (!ts) return graph;

  const exportSymbolIndex = new Map(); // exportedName -> [{symbolId,file}]

  for (const [relativePath, info] of fileMap.entries()) {
    if (
      !isAstCapableLanguage(info.language) ||
      typeof info.source !== "string"
    ) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      relativePath,
      info.source,
      ts.ScriptTarget.Latest,
      true,
      info.language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    );

    const fileSymbols = [];
    const fileCalls = [];
    const fileImports = [];
    const localFunctions = new Set();

    let currentScope = null;

    function nodeLine(node) {
      return (
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1
      );
    }

    function addSymbol(kind, name, node, exported = false) {
      const symbolId = `${relativePath}#${name}@${node.pos}`;
      const symbol = {
        symbolId,
        file: relativePath,
        name,
        kind,
        exported,
        line: nodeLine(node),
      };
      graph.symbolNodes.push(symbol);
      fileSymbols.push(symbol);
      localFunctions.add(name);
      if (exported) {
        if (!exportSymbolIndex.has(name)) exportSymbolIndex.set(name, []);
        exportSymbolIndex.get(name).push({ symbolId, file: relativePath });
      }
      return symbolId;
    }

    function visit(node) {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
        const specifier = String(node.moduleSpecifier.text || "");
        fileImports.push({
          from: relativePath,
          specifier,
          line: nodeLine(node),
        });
      }

      if (ts.isFunctionDeclaration(node) && node.name) {
        const exported = !!(node.modifiers || []).find(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        );
        const prev = currentScope;
        currentScope = addSymbol("function", node.name.text, node, exported);
        ts.forEachChild(node, visit);
        currentScope = prev;
        return;
      }

      if (ts.isClassDeclaration(node) && node.name) {
        const exported = !!(node.modifiers || []).find(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        );
        const classScope = addSymbol("class", node.name.text, node, exported);
        const prev = currentScope;
        currentScope = classScope;
        ts.forEachChild(node, visit);
        currentScope = prev;
        return;
      }

      if (
        ts.isMethodDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name)
      ) {
        const prev = currentScope;
        currentScope = addSymbol("method", node.name.text, node, false);
        ts.forEachChild(node, visit);
        currentScope = prev;
        return;
      }

      if (ts.isVariableStatement(node)) {
        const exported = !!(node.modifiers || []).find(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        );
        for (const decl of node.declarationList.declarations) {
          if (decl.name && ts.isIdentifier(decl.name)) {
            addSymbol("variable", decl.name.text, decl, exported);
          }
        }
      }

      if (ts.isCallExpression(node)) {
        let targetName = null;
        if (ts.isIdentifier(node.expression)) {
          targetName = node.expression.text;
        } else if (ts.isPropertyAccessExpression(node.expression)) {
          targetName = node.expression.name.text;
        }
        if (targetName && currentScope) {
          const edge = {
            fromSymbolId: currentScope,
            toName: targetName,
            file: relativePath,
            line: nodeLine(node),
            internal: localFunctions.has(targetName),
          };
          graph.callEdges.push(edge);
          fileCalls.push(edge);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    graph.filesProcessed += 1;
    graph.byFile[relativePath] = {
      symbols: fileSymbols,
      calls: fileCalls,
      imports: fileImports,
    };
    graph.importEdges.push(...fileImports);
  }

  // Link call edges to exported symbols where names match
  const resolvedCalls = [];
  for (const edge of graph.callEdges) {
    const targets = exportSymbolIndex.get(edge.toName) || [];
    if (targets.length > 0) {
      for (const t of targets) {
        resolvedCalls.push({ ...edge, toSymbolId: t.symbolId, toFile: t.file });
      }
    } else {
      resolvedCalls.push(edge);
    }
  }
  graph.callEdges = resolvedCalls;

  return graph;
}

function getCallersOfSymbol(astGraph, symbolName) {
  if (!astGraph || !Array.isArray(astGraph.callEdges)) return [];
  return astGraph.callEdges.filter((e) => e.toName === symbolName);
}

module.exports = {
  buildAstSymbolGraph,
  getCallersOfSymbol,
  isAstCapableLanguage,
};
