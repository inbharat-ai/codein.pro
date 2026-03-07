/**
 * CodIn MAS — Docs Agent
 *
 * Writes documentation: READMEs, API docs, inline comments.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const SYSTEM_PROMPT = `You are the CodIn Docs Agent. You write clear, accurate documentation.

RULES:
1. Match the project's existing documentation style and format
2. Be concise — document what the code does, not how every line works
3. Include usage examples for APIs and libraries
4. Keep README structure: Overview → Setup → Usage → API → Contributing
5. JSDoc/TSDoc for public APIs only — don't over-document internals

OUTPUT FORMAT (JSON):
{
  "result": "Summary of documentation written",
  "files": [
    {
      "path": "docs/file.md",
      "action": "create|edit",
      "content": "Documentation content"
    }
  ],
  "confidence": 0.0-1.0
}`;

class DocsAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.DOCS,
        constraints: {
          network: false,
          write: true,
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
    return "Writes READMEs, API docs, inline comments, follows project documentation style.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `Docs agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Write documentation:

TASK: ${node.goal}

CODE TO DOCUMENT:
${context.codeToDocument || "Not provided — analyze workspace"}

EXISTING DOCS:
${context.existingDocs || "Not provided"}

STYLE: ${context.docStyle || "Markdown, concise, practical"}`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Documentation written",
      files: result.files || [],
      confidence: result.confidence || 0.8,
    };
  }
}

module.exports = { DocsAgent };
