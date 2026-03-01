function getRouterDecision({
  prompt,
  contextChars,
  deepPlanning,
  preferAccuracy,
  hasLocalModel,
}) {
  const text = (prompt || "").toLowerCase();
  const reasonerKeywords = [
    "architecture",
    "plan",
    "refactor",
    "migration",
    "multi-step",
    "many files",
    "security",
    "ci",
  ];
  const reasonerMatch = reasonerKeywords.some((keyword) =>
    text.includes(keyword),
  );
  const useReasoner =
    !!deepPlanning || reasonerMatch || (contextChars && contextChars > 12000);

  if (!hasLocalModel || preferAccuracy) {
    return {
      provider: "cloud",
      role: useReasoner ? "reasoner" : "coder",
      reason: preferAccuracy ? "max-accuracy" : "local-unavailable",
    };
  }

  return {
    provider: "local",
    role: useReasoner ? "reasoner" : "coder",
    reason: useReasoner ? "reasoner-heuristics" : "coder-heuristics",
  };
}

module.exports = { getRouterDecision };
