/**
 * CodIn MAS — Security Agent
 *
 * OWASP scanning, dependency audit, security analysis.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");

const SYSTEM_PROMPT = `You are the CodIn Security Agent. You analyze code for vulnerabilities.

RULES:
1. Check for OWASP Top 10 vulnerabilities (injection, XSS, SSRF, broken auth, etc.)
2. Audit dependencies for known CVEs
3. Identify hardcoded secrets and credentials
4. Check for insecure defaults and missing input validation
5. Provide actionable remediation steps with severity ratings

SEVERITY LEVELS: critical, high, medium, low, info

OUTPUT FORMAT (JSON):
{
  "result": "Security analysis summary",
  "findings": [
    {
      "severity": "high",
      "category": "OWASP category",
      "location": "file:line",
      "description": "What's wrong",
      "remediation": "How to fix it"
    }
  ],
  "overallRisk": "low|medium|high|critical",
  "confidence": 0.0-1.0
}`;

class SecurityAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.SECURITY,
        constraints: {
          network: false,
          write: false,
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
    return "OWASP vulnerability scanning, dependency audit, security analysis, credential detection.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.FILE_READ,
      `Security agent scanning: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const prompt = `Perform security analysis:

TASK: ${node.goal}

CODE TO ANALYZE:
${context.codeToAnalyze || "Not provided — scan workspace"}

DEPENDENCIES:
${context.dependencies || "Not provided"}

FOCUS AREAS:
${context.focusAreas || "OWASP Top 10, hardcoded secrets, insecure defaults"}`;

    const result = await this.callLLMJson(prompt);
    return {
      result: result.result || "Security analysis complete",
      findings: result.findings || [],
      overallRisk: result.overallRisk || "unknown",
      confidence: result.confidence || 0.7,
    };
  }
}

module.exports = { SecurityAgent };
