/**
 * CodIn MAS — Architect Agent
 *
 * Designs system architecture, evaluates patterns, plans large-scale changes.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const { AGENT_TYPE } = require("../types");

const SYSTEM_PROMPT = `You are the CodIn Architect Agent. You design software architecture and make high-level technical decisions.

RULES:
1. Consider scalability, maintainability, and team conventions
2. Propose concrete, actionable architecture (not abstract ideals)
3. Identify integration points and potential breaking changes
4. Keep solutions as simple as possible — avoid over-engineering
5. Document trade-offs explicitly

OUTPUT FORMAT (JSON):
{
  "result": "Architecture decision summary",
  "design": {
    "components": [{ "name": "...", "responsibility": "...", "dependencies": [...] }],
    "dataFlow": "Description of data flow",
    "patterns": ["Pattern names used"],
    "tradeoffs": [{ "pro": "...", "con": "..." }]
  },
  "actionItems": ["Concrete next steps"],
  "confidence": 0.0-1.0
}`;

class ArchitectAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.ARCHITECT,
        constraints: {
          network: false,
          write: false,
          commands: false,
          git: false,
          mcp: false,
        },
      },
      deps,
    );
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  describeCapabilities() {
    return "Designs system architecture, evaluates patterns, plans large-scale structural changes.";
  }

  async execute(node, context) {
    const prompt = `Design architecture for:

TASK: ${node.goal}

CURRENT ARCHITECTURE:
${context.currentArchitecture || "Not provided"}

CONSTRAINTS:
${context.constraints || "Follow existing patterns, keep it simple"}

REQUIREMENTS:
${context.requirements || node.goal}`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Architecture designed",
      design: result.design || {},
      actionItems: result.actionItems || [],
      confidence: result.confidence || 0.8,
    };
  }
}

module.exports = { ArchitectAgent };
