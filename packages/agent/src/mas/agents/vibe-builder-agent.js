/**
 * CodIn MAS — Vibe Builder Agent
 *
 * Rapidly scaffolds projects and prototypes with focus on aesthetics,
 * UX polish, and getting a working demo fast.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");
const { buildToolRegistry } = require("../tool-registry");

const SYSTEM_PROMPT = `You are the CodIn Vibe Builder Agent. You rapidly scaffold beautiful, functional prototypes.

RULES:
1. Prioritize speed and visual appeal — get something working and good-looking fast
2. Use modern UI patterns (responsive, accessible, dark mode friendly)
3. Include sensible defaults and placeholder content
4. Wire up basic interactivity — buttons click, forms submit, nav works
5. Keep dependencies minimal — prefer CSS over heavy UI libraries when possible

You have tools to read files, write files, and run commands. Use them to scaffold
real files and install dependencies. Work iteratively: read existing code, write new
files, run setup commands.

OUTPUT FORMAT (JSON):
{
  "result": "Summary of what was scaffolded",
  "files": [
    {
      "path": "relative/path/to/file",
      "action": "create|edit",
      "content": "Full file content"
    }
  ],
  "stack": "react|vue|vanilla|etc",
  "confidence": 0.0-1.0,
  "nextSteps": "What to do next to make it production-ready"
}`;

class VibeBuilderAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.VIBE_BUILDER,
        constraints: {
          network: false,
          write: true,
          commands: true,
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
    return "Rapidly scaffolds projects and prototypes with focus on aesthetics and UX.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Vibe Builder: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Scaffold/prototype task:

TASK: ${node.goal}

CONTEXT:
${context.workspaceSummary || "No workspace context."}
${context.repoContext?.context ? `REPO CONTEXT:\n${String(context.repoContext.context).slice(0, 6000)}` : ""}
${context.plan ? `PLAN: ${JSON.stringify(context.plan).slice(0, 1000)}` : ""}
${context.previousResults ? `PREVIOUS RESULTS:\n${context.previousResults.slice(0, 1000)}` : ""}

Create a working, visually appealing prototype. Focus on speed and aesthetics.
Use the available tools to read existing files, write new ones, and run setup commands.`;

    const toolRegistry = buildToolRegistry(this, context, node, {
      tools: ["read_file", "write_file", "run_bash"],
      agentLabel: "Vibe Builder",
      commandProfile: "DEV",
    });

    if (Object.keys(toolRegistry).length > 0) {
      const result = await this.callLLMWithTools(prompt, toolRegistry, {
        maxIterations: 8,
      });
      return {
        result: result.answer,
        toolLog: result.toolLog,
        confidence: this.computeConfidence(result, context),
      };
    } else {
      const result = await this.callLLMJson(prompt);
      return {
        result: result.result || "Prototype scaffolded",
        files: result.files || [],
        stack: result.stack || "unknown",
        confidence: result.confidence || 0.8,
        nextSteps: result.nextSteps || "",
      };
    }
  }
}

module.exports = { VibeBuilderAgent };
