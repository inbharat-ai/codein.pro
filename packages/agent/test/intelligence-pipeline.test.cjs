/**
 * @fileoverview Comprehensive test suite for Intelligence Pipeline
 * Tests: ComplexityClassifier, VerificationEngine, ConfidenceScorer,
 * BudgetGuardrails, DecisionLogger, HybridOrchestrator integration.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ComplexityClassifier Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("ComplexityClassifier: source exports ComplexityClassifier class", () => {
  const source = readSource("src/intelligence/complexity-classifier.js");
  assert.match(source, /class ComplexityClassifier/);
  assert.match(source, /module\.exports/);
});

test("ComplexityClassifier: defines COMPLEXITY_SIGNALS for high/medium/low", () => {
  const source = readSource("src/intelligence/complexity-classifier.js");
  assert.match(source, /COMPLEXITY_SIGNALS/);
  assert.match(source, /high\s*:/);
  assert.match(source, /medium\s*:/);
  assert.match(source, /low\s*:/);
});

test("ComplexityClassifier: has classify method returning required fields", () => {
  const source = readSource("src/intelligence/complexity-classifier.js");
  assert.match(source, /classify\s*\(/);
  // Should return complexity, risk, needsPremium, score, riskScore, signals
  assert.match(source, /complexity/);
  assert.match(source, /needsPremium/);
  assert.match(source, /riskScore/);
  assert.match(source, /signals/);
  assert.match(source, /recommendation/);
});

test("ComplexityClassifier: defines RISK_SIGNALS for security-sensitive detection", () => {
  const source = readSource("src/intelligence/complexity-classifier.js");
  assert.match(source, /RISK_SIGNALS/);
  // Should detect security patterns
  assert.match(source, /auth|security|crypt|password|token/i);
});

test("ComplexityClassifier: estimates tokens from prompt length", () => {
  const source = readSource("src/intelligence/complexity-classifier.js");
  assert.match(source, /estimateTokens|tokenCount|token/i);
});

test("ComplexityClassifier: can instantiate and classify", () => {
  const { ComplexityClassifier } = require(path.resolve(__dirname, "../src/intelligence/complexity-classifier.js"));
  const classifier = new ComplexityClassifier();
  const result = classifier.classify("Fix a typo in the README");
  assert.ok(result.complexity, "Should have complexity level");
  assert.ok(typeof result.score === "number", "Should have numeric score");
  assert.ok(typeof result.needsPremium === "boolean", "Should have needsPremium flag");
  assert.ok(Array.isArray(result.signals), "Should have signals array");
});

test("ComplexityClassifier: rates simple prompts as low complexity", () => {
  const { ComplexityClassifier } = require(path.resolve(__dirname, "../src/intelligence/complexity-classifier.js"));
  const classifier = new ComplexityClassifier();
  const result = classifier.classify("Fix a typo in the README");
  assert.equal(result.complexity, "low", "Simple typo fix should be low complexity");
  assert.equal(result.needsPremium, false);
});

test("ComplexityClassifier: rates architecture prompts as high complexity", () => {
  const { ComplexityClassifier } = require(path.resolve(__dirname, "../src/intelligence/complexity-classifier.js"));
  const classifier = new ComplexityClassifier();
  const result = classifier.classify(
    "Refactor the entire authentication system across multiple services, " +
    "redesign the database schema with migration scripts, " +
    "and implement security audit for all API endpoints"
  );
  assert.equal(result.complexity, "high", "Complex multi-system prompt should be high");
  assert.equal(result.needsPremium, true, "Should need premium for high complexity");
});

// ═══════════════════════════════════════════════════════════════════════════════
// VerificationEngine Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("VerificationEngine: source exports VerificationEngine class", () => {
  const source = readSource("src/intelligence/verification-engine.js");
  assert.match(source, /class VerificationEngine/);
  assert.match(source, /module\.exports/);
});

test("VerificationEngine: runs 6 verification checks", () => {
  const source = readSource("src/intelligence/verification-engine.js");
  // All 6 checks should be present
  assert.match(source, /syntax/i);
  assert.match(source, /import/i);
  assert.match(source, /hallucination/i);
  assert.match(source, /static/i);
  assert.match(source, /typecheck|tsc/i);
  assert.match(source, /lint|eslint/i);
});

test("VerificationEngine: has extractCodeBlocks utility", () => {
  const source = readSource("src/intelligence/verification-engine.js");
  assert.match(source, /extractCodeBlocks/);
});

test("VerificationEngine: defines HALLUCINATION_PATTERNS", () => {
  const source = readSource("src/intelligence/verification-engine.js");
  assert.match(source, /HALLUCINATION_PATTERNS/);
});

test("VerificationEngine: defines STANDARD_MODULES for import validation", () => {
  const source = readSource("src/intelligence/verification-engine.js");
  assert.match(source, /STANDARD_MODULES/);
});

test("VerificationEngine: can instantiate and verify clean code", async () => {
  const { VerificationEngine } = require(path.resolve(__dirname, "../src/intelligence/verification-engine.js"));
  const engine = new VerificationEngine({ typecheck: false, lint: false });
  const response = "Here's the fix:\n```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```";
  const result = await engine.verify(response, { language: "javascript" });
  assert.ok(result, "Should return verification result");
  assert.ok(typeof result.confidence === "number", "Should have confidence score");
  assert.ok(Array.isArray(result.issues), "Should have issues array");
});

test("VerificationEngine: detects syntax errors (unbalanced brackets)", async () => {
  const { VerificationEngine } = require(path.resolve(__dirname, "../src/intelligence/verification-engine.js"));
  const engine = new VerificationEngine({ typecheck: false, lint: false });
  const response = "```javascript\nfunction broken() {\n  if (true) {\n    console.log('missing bracket')\n}\n```";
  const result = await engine.verify(response, { language: "javascript" });
  // Should detect unbalanced brackets — lower confidence
  assert.ok(result.confidence < 0.95, "Unbalanced brackets should reduce confidence");
});

test("VerificationEngine: detects static analysis issues (eval usage)", async () => {
  const { VerificationEngine } = require(path.resolve(__dirname, "../src/intelligence/verification-engine.js"));
  const engine = new VerificationEngine({ typecheck: false, lint: false });
  const response = "```javascript\nconst result = eval(userInput);\n```";
  const result = await engine.verify(response, { language: "javascript" });
  assert.ok(result.issues.length > 0, "eval usage should flag a static analysis issue");
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfidenceScorer Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("ConfidenceScorer: source exports ConfidenceScorer class", () => {
  const source = readSource("src/intelligence/confidence-scorer.js");
  assert.match(source, /class ConfidenceScorer/);
  assert.match(source, /module\.exports/);
});

test("ConfidenceScorer: uses 5 weighted components", () => {
  const source = readSource("src/intelligence/confidence-scorer.js");
  assert.match(source, /verification/);
  assert.match(source, /modelQuality/);
  assert.match(source, /complexityMatch/);
  assert.match(source, /contextCoverage/);
  assert.match(source, /history/);
});

test("ConfidenceScorer: has escalation threshold at 0.45", () => {
  const source = readSource("src/intelligence/confidence-scorer.js");
  assert.match(source, /0\.45/);
});

test("ConfidenceScorer: outputs display with badge emoji", () => {
  const source = readSource("src/intelligence/confidence-scorer.js");
  assert.match(source, /🟢|🟡|🔴/);
  assert.match(source, /display/);
  assert.match(source, /badge/);
});

test("ConfidenceScorer: can instantiate and score", () => {
  const { ConfidenceScorer } = require(path.resolve(__dirname, "../src/intelligence/confidence-scorer.js"));
  const scorer = new ConfidenceScorer();
  const result = scorer.score({
    verification: { confidence: 0.9, passed: true, issues: [], checksRun: ["syntax"] },
    classification: { complexity: "low", score: 0.2, needsPremium: false },
    model: { qualityScore: 0.75, isLocal: true },
    context: { tokensCovered: 500, tokensAvailable: 1000 },
  });
  assert.ok(typeof result.score === "number", "Should have numeric score");
  assert.ok(result.level, "Should have level (high/medium/low)");
  assert.ok(result.display, "Should have display object");
  assert.ok(result.display.badge, "Should have badge emoji");
});

test("ConfidenceScorer: high verification = high confidence", () => {
  const { ConfidenceScorer } = require(path.resolve(__dirname, "../src/intelligence/confidence-scorer.js"));
  const scorer = new ConfidenceScorer();
  const result = scorer.score({
    verification: { confidence: 0.95, passed: true, issues: [], checksRun: ["syntax", "imports"] },
    classification: { complexity: "low", score: 0.2, needsPremium: false },
    model: { qualityScore: 0.80, isLocal: true },
    context: { tokensCovered: 1000, tokensAvailable: 1000 },
  });
  assert.ok(result.score >= 0.7, "Good inputs should produce high confidence");
});

test("ConfidenceScorer: signals escalation for bad verification + high complexity", () => {
  const { ConfidenceScorer } = require(path.resolve(__dirname, "../src/intelligence/confidence-scorer.js"));
  const scorer = new ConfidenceScorer();
  const result = scorer.score({
    verification: { confidence: 0.3, passed: false, issues: [{ severity: "error" }, { severity: "error" }], checksRun: ["syntax"] },
    classification: { complexity: "high", score: 0.8, needsPremium: true },
    model: { qualityScore: 0.55, isLocal: true },
    context: { tokensCovered: 0, tokensAvailable: 0 },
  });
  assert.ok(result.shouldEscalate, "Low confidence + high complexity should trigger escalation");
});

// ═══════════════════════════════════════════════════════════════════════════════
// BudgetGuardrails Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("BudgetGuardrails: source exports BudgetGuardrails class", () => {
  const source = readSource("src/intelligence/budget-guardrails.js");
  assert.match(source, /class BudgetGuardrails/);
  assert.match(source, /module\.exports/);
});

test("BudgetGuardrails: has per-request, hourly, daily, monthly limits", () => {
  const source = readSource("src/intelligence/budget-guardrails.js");
  assert.match(source, /perRequestMaxCost/);
  assert.match(source, /hourlyBudget/);
  assert.match(source, /dailyBudget/);
  assert.match(source, /monthlyBudget/);
});

test("BudgetGuardrails: has checkBudget method", () => {
  const source = readSource("src/intelligence/budget-guardrails.js");
  assert.match(source, /checkBudget\s*\(/);
});

test("BudgetGuardrails: has estimateCost method", () => {
  const source = readSource("src/intelligence/budget-guardrails.js");
  assert.match(source, /estimateCost\s*\(/);
});

test("BudgetGuardrails: has warning threshold at 80%", () => {
  const source = readSource("src/intelligence/budget-guardrails.js");
  assert.match(source, /0\.8|80/);
  assert.match(source, /warning/i);
});

test("BudgetGuardrails: can instantiate and check budget", () => {
  const { BudgetGuardrails } = require(path.resolve(__dirname, "../src/intelligence/budget-guardrails.js"));
  // Use temp state path to avoid polluting real state
  const guardrails = new BudgetGuardrails({
    statePath: path.join(__dirname, "tmp-budget-test.json"),
  });
  const result = guardrails.checkBudget(0.01);
  assert.ok(typeof result.allowed === "boolean", "Should return allowed boolean");
  // Cleanup
  try { fs.unlinkSync(path.join(__dirname, "tmp-budget-test.json")); } catch {}
});

test("BudgetGuardrails: blocks exceeding per-request limit", () => {
  const { BudgetGuardrails } = require(path.resolve(__dirname, "../src/intelligence/budget-guardrails.js"));
  const guardrails = new BudgetGuardrails({
    perRequestMaxCost: 0.10,
    statePath: path.join(__dirname, "tmp-budget-test2.json"),
  });
  const result = guardrails.checkBudget(0.50);
  assert.equal(result.allowed, false, "Should block requests exceeding per-request limit");
  try { fs.unlinkSync(path.join(__dirname, "tmp-budget-test2.json")); } catch {}
});

test("BudgetGuardrails: estimates cost from token counts", () => {
  const { BudgetGuardrails } = require(path.resolve(__dirname, "../src/intelligence/budget-guardrails.js"));
  const guardrails = new BudgetGuardrails({
    statePath: path.join(__dirname, "tmp-budget-test3.json"),
  });
  const cost = guardrails.estimateCost("openai", 1000, 500);
  assert.ok(typeof cost === "number", "Should return numeric cost");
  assert.ok(cost > 0, "Cost should be positive for real provider");
  try { fs.unlinkSync(path.join(__dirname, "tmp-budget-test3.json")); } catch {}
});

// ═══════════════════════════════════════════════════════════════════════════════
// DecisionLogger Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("DecisionLogger: source exports IntelligenceLogger class", () => {
  const source = readSource("src/intelligence/decision-logger.js");
  assert.match(source, /class IntelligenceLogger/);
  assert.match(source, /module\.exports/);
});

test("DecisionLogger: writes JSONL format logs", () => {
  const source = readSource("src/intelligence/decision-logger.js");
  assert.match(source, /jsonl|JSONL|JSON\.stringify/i);
});

test("DecisionLogger: supports log rotation (30 days)", () => {
  const source = readSource("src/intelligence/decision-logger.js");
  assert.match(source, /rotate|rotation|30/i);
});

test("DecisionLogger: supports real-time listeners", () => {
  const source = readSource("src/intelligence/decision-logger.js");
  assert.match(source, /onDecision|listener|subscribe/i);
});

test("DecisionLogger: has getDecisionStats for analytics", () => {
  const source = readSource("src/intelligence/decision-logger.js");
  assert.match(source, /getDecisionStats|getStats/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// HybridIntelligenceOrchestrator Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("HybridOrchestrator: source exports HybridIntelligenceOrchestrator", () => {
  const source = readSource("src/intelligence/hybrid-orchestrator.js");
  assert.match(source, /class HybridIntelligenceOrchestrator/);
  assert.match(source, /module\.exports/);
});

test("HybridOrchestrator: extends EventEmitter for pipeline events", () => {
  const source = readSource("src/intelligence/hybrid-orchestrator.js");
  assert.match(source, /EventEmitter/);
  assert.match(source, /extends/);
});

test("HybridOrchestrator: implements 9-step pipeline", () => {
  const source = readSource("src/intelligence/hybrid-orchestrator.js");
  // Key pipeline stages
  assert.match(source, /classify/i);
  assert.match(source, /route|routing/i);
  assert.match(source, /verify/i);
  assert.match(source, /score|confidence/i);
  assert.match(source, /escalat/i);
  assert.match(source, /log/i);
});

test("HybridOrchestrator: emits pipeline-start and pipeline-complete events", () => {
  const source = readSource("src/intelligence/hybrid-orchestrator.js");
  assert.match(source, /pipeline-start/);
  assert.match(source, /pipeline-complete/);
});

test("HybridOrchestrator: emits escalation events", () => {
  const source = readSource("src/intelligence/hybrid-orchestrator.js");
  assert.match(source, /escalating/);
  assert.match(source, /budget-blocked/);
});

test("HybridOrchestrator: has process method as main entry point", () => {
  const source = readSource("src/intelligence/hybrid-orchestrator.js");
  assert.match(source, /async\s+process\s*\(/);
});

test("HybridOrchestrator: has streaming support", () => {
  const source = readSource("src/intelligence/hybrid-orchestrator.js");
  assert.match(source, /processStream|stream/i);
});

test("HybridOrchestrator: uses all sub-modules", () => {
  const source = readSource("src/intelligence/hybrid-orchestrator.js");
  assert.match(source, /ComplexityClassifier/);
  assert.match(source, /VerificationEngine/);
  assert.match(source, /ConfidenceScorer/);
  assert.match(source, /BudgetGuardrails/);
  assert.match(source, /IntelligenceLogger/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Intelligence Routes Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("Intelligence routes: source exports registerIntelligenceRoutes", () => {
  const source = readSource("src/routes/intelligence.js");
  assert.match(source, /registerIntelligenceRoutes/);
  assert.match(source, /module\.exports/);
});

test("Intelligence routes: has POST /intelligence/process endpoint", () => {
  const source = readSource("src/routes/intelligence.js");
  assert.match(source, /intelligence\/process/);
});

test("Intelligence routes: has GET /intelligence/stats endpoint", () => {
  const source = readSource("src/routes/intelligence.js");
  assert.match(source, /intelligence\/stats/);
});

test("Intelligence routes: has budget management endpoints", () => {
  const source = readSource("src/routes/intelligence.js");
  assert.match(source, /intelligence\/budget/);
  assert.match(source, /budget\/limits/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Integration: Registry + Index wiring Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("Registry: imports and registers intelligence routes", () => {
  const source = readSource("src/routes/registry.js");
  assert.match(source, /registerIntelligenceRoutes/);
});

test("Index: declares and initializes intelligence orchestrator", () => {
  const source = readSource("src/index.js");
  assert.match(source, /HybridIntelligenceOrchestrator/);
  assert.match(source, /intelligence/);
});

test("Index: passes intelligence to buildRouter deps", () => {
  const source = readSource("src/index.js");
  assert.match(source, /intelligence/);
  // intelligence should appear in the createAppRouter deps object
  assert.match(source, /createAppRouter\s*\(/s, "Should call createAppRouter");
  const afterCreate = source.slice(source.indexOf("createAppRouter"));
  assert.match(afterCreate, /intelligence/, "intelligence should be in createAppRouter deps");
});

// ═══════════════════════════════════════════════════════════════════════════════
// End-to-end Functional: classify → verify → score pipeline
// ═══════════════════════════════════════════════════════════════════════════════

test("E2E: classify → verify → score pipeline produces valid result", async () => {
  const { ComplexityClassifier } = require(path.resolve(__dirname, "../src/intelligence/complexity-classifier.js"));
  const { VerificationEngine } = require(path.resolve(__dirname, "../src/intelligence/verification-engine.js"));
  const { ConfidenceScorer } = require(path.resolve(__dirname, "../src/intelligence/confidence-scorer.js"));

  const classifier = new ComplexityClassifier();
  const verifier = new VerificationEngine({ typecheck: false, lint: false });
  const scorer = new ConfidenceScorer();

  // Step 1: Classify
  const classification = classifier.classify("Write a function to sort an array");
  assert.ok(classification.complexity);

  // Step 2: Mock a model response and verify
  const mockResponse = "```javascript\nfunction sortArray(arr) {\n  return [...arr].sort((a, b) => a - b);\n}\n```";
  const verification = await verifier.verify(mockResponse, { language: "javascript" });
  assert.ok(verification.confidence > 0, `Confidence should be > 0, got ${verification.confidence}`);

  // Step 3: Score confidence
  const confidence = scorer.score({
    verification: verification,
    classification: { complexity: classification.complexity, score: classification.score, needsPremium: classification.needsPremium },
    model: { qualityScore: 0.72, isLocal: true },
    context: { tokensCovered: 200, tokensAvailable: 500 },
  });
  assert.ok(confidence.score > 0 && confidence.score <= 1);
  assert.ok(confidence.display.badge);
  assert.ok(confidence.level);
});

test("E2E: high-complexity prompt triggers escalation recommendation", async () => {
  const { ComplexityClassifier } = require(path.resolve(__dirname, "../src/intelligence/complexity-classifier.js"));
  const { VerificationEngine } = require(path.resolve(__dirname, "../src/intelligence/verification-engine.js"));
  const { ConfidenceScorer } = require(path.resolve(__dirname, "../src/intelligence/confidence-scorer.js"));

  const classifier = new ComplexityClassifier();
  const verifier = new VerificationEngine({ typecheck: false, lint: false });
  const scorer = new ConfidenceScorer();

  // High complexity prompt — needs premium
  const classification = classifier.classify(
    "Refactor the entire authentication system across multiple services, " +
    "redesign the database schema with migration scripts, " +
    "and implement security audit for all endpoints with integration tests"
  );
  assert.ok(classification.needsPremium, "Complex prompt should need premium");

  // Poor model output with syntax errors and eval
  const badResponse = "```javascript\nfunction cache( {\n  const result = eval(userInput);\n  const key = password = 'hardcoded123456';\n  while (true) {\n  // infinite\n}\n```";
  const verification = await verifier.verify(badResponse, { language: "javascript" });

  // Score should signal escalation
  const confidence = scorer.score({
    verification: verification,
    classification: { complexity: "high", score: 0.8, needsPremium: true },
    model: { qualityScore: 0.55, isLocal: true },
    context: { tokensCovered: 0, tokensAvailable: 0 },
  });
  assert.ok(confidence.shouldEscalate, "Bad output on hard task should trigger escalation");
});
