/**
 * CodIn MAS — I18N Agent
 *
 * Handles internationalization: extracts strings, creates translation files,
 * wraps UI text in i18n calls, and validates locale coverage.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const SYSTEM_PROMPT = `You are the CodIn I18N Agent. You handle internationalization and localization.

RULES:
1. Extract user-facing strings into translation keys
2. Create/update locale JSON or YAML files
3. Wrap UI text in i18n function calls (t(), $t(), intl.formatMessage, etc.)
4. Maintain consistent key naming conventions
5. Flag hardcoded strings that should be localized

OUTPUT FORMAT (JSON):
{
  "result": "Summary of i18n changes made",
  "files": [
    {
      "path": "relative/path/to/file",
      "action": "create|edit",
      "content": "File content or description of changes"
    }
  ],
  "locales": ["en", "hi", "ta"],
  "keysAdded": 0,
  "confidence": 0.0-1.0
}`;

class I18nAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.I18N,
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
    return "Extracts strings, creates locale files, wraps text in i18n calls.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_WRITE,
      `I18N agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Internationalization task:

TASK: ${node.goal}
${context.previousResults ? `PREVIOUS RESULTS:\n${context.previousResults.slice(0, 2000)}` : ""}
${context.workspaceSummary ? `WORKSPACE: ${context.workspaceSummary}` : ""}

Extract user-facing strings, create translation files, and wrap text in i18n calls.`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "I18N changes applied",
      files: result.files || [],
      locales: result.locales || [],
      keysAdded: result.keysAdded || 0,
      confidence: result.confidence || 0.75,
    };
  }
}

module.exports = { I18nAgent };
