/**
 * Task Complexity Classifier
 *
 * Determines whether a user input should be routed to:
 * - Local LLM (simple chat, <= 5-10 seconds latency acceptable)
 * - Multi-Agent Server (complex multi-step, wants full orchestration)
 */

export interface ClassificationResult {
  isComplex: boolean;
  reason:
    | "simple_chat"
    | "requires_multi_step"
    | "requires_planning"
    | "requires_iteration"
    | "refactoring"
    | "test_generation"
    | "architecture_design";
  confidence: number; // 0-1
  suggestedTopology?: "mesh" | "hierarchical" | "ring";
}

const MULTI_STEP_KEYWORDS = [
  "refactor",
  "redesign",
  "add feature",
  "implement",
  "fix bug",
  "debug",
  "optimize",
  "test",
  "migrate",
  "convert",
  "extract",
  "component",
  "unit test",
  "integration test",
];

const PLANNING_KEYWORDS = [
  "plan",
  "architect",
  "design",
  "structure",
  "organize",
  "outline",
];

const ITERATION_KEYWORDS = [
  "try again",
  "repeat",
  "loop",
  "iterate",
  "multiple times",
];

const REFACTOR_KEYWORDS = [
  "refactor",
  "clean up",
  "improve",
  "simplify",
  "extract method",
  "remove duplication",
];

const TEST_KEYWORDS = [
  "test",
  "unit test",
  "integration test",
  "coverage",
  "cypress",
  "jest",
  "pytest",
];

const ARCHITECTURE_KEYWORDS = [
  "architecture",
  "design",
  "pattern",
  "structure",
  "enterprise",
  "scalab",
];

/**
 * Classify task complexity based on user input
 */
export function classifyInputComplexity(
  userInput: string,
): ClassificationResult {
  const lowerInput = userInput.toLowerCase();
  let score = 0;
  let reason: ClassificationResult["reason"] = "simple_chat";
  let suggestedTopology: "mesh" | "hierarchical" | "ring" | undefined =
    undefined;

  // Check for multi-step keywords
  if (MULTI_STEP_KEYWORDS.some((kw) => lowerInput.includes(kw))) {
    score += 0.3;
    reason = "requires_multi_step";
    suggestedTopology = "hierarchical";
  }

  // Check for planning keywords
  if (PLANNING_KEYWORDS.some((kw) => lowerInput.includes(kw))) {
    score += 0.4;
    reason = "requires_planning";
    suggestedTopology = "hierarchical";
  }

  // Check for iteration keywords
  if (ITERATION_KEYWORDS.some((kw) => lowerInput.includes(kw))) {
    score += 0.2;
    reason = "requires_iteration";
    suggestedTopology = "ring";
  }

  // Check for refactoring
  if (REFACTOR_KEYWORDS.some((kw) => lowerInput.includes(kw))) {
    score += 0.35;
    reason = "refactoring";
    suggestedTopology = "hierarchical";
  }

  // Check for testing
  if (TEST_KEYWORDS.some((kw) => lowerInput.includes(kw))) {
    score += 0.3;
    reason = "test_generation";
    suggestedTopology = "mesh"; // Parallel test generation
  }

  // Check for architecture
  if (ARCHITECTURE_KEYWORDS.some((kw) => lowerInput.includes(kw))) {
    score += 0.4;
    reason = "architecture_design";
    suggestedTopology = "hierarchical";
  }

  // Check for question marks (questions are usually simple)
  if (lowerInput.includes("?") && score < 0.3) {
    score = Math.max(0, score - 0.1);
  }

  // Check length (longer inputs often more complex, but not always)
  if (userInput.length > 500) {
    score += 0.1;
  } else if (userInput.length < 30) {
    score = Math.max(0, score - 0.1);
  }

  const isComplex = score > 0.4;
  const confidence = Math.min(1, Math.abs(score));

  return {
    isComplex,
    reason,
    confidence,
    suggestedTopology: isComplex ? suggestedTopology : undefined,
  };
}

/**
 * Check if a mode should use multi-agent (e.g., refactor mode, debug mode)
 */
export function shouldUseMultiAgentForMode(mode: string): boolean {
  const multiAgentModes = [
    "refactor",
    "debug",
    "test",
    "architect",
    "optimize",
  ];
  return multiAgentModes.includes(mode.toLowerCase());
}

/**
 * Check if user explicitly requested multi-agent via prefix
 */
export function getExplicitMultiAgentRequest(
  userInput: string,
): { requested: boolean; goal: string } | null {
  // Check for explicit multi-agent request prefixes
  if (userInput.startsWith("@swarm ") || userInput.startsWith("/swarm ")) {
    return {
      requested: true,
      goal: userInput.slice(7).trim(),
    };
  }

  if (userInput.startsWith("@agents ") || userInput.startsWith("/agents ")) {
    return {
      requested: true,
      goal: userInput.slice(8).trim(),
    };
  }

  if (userInput.startsWith("@mas ") || userInput.startsWith("/mas ")) {
    return {
      requested: true,
      goal: userInput.slice(5).trim(),
    };
  }

  return null;
}
