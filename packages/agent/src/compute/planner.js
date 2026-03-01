/**
 * CodeIn Compute — Planner
 *
 * Takes a user goal and generates an ordered plan of steps.
 * Uses local LLM by default via the existing model router + runtime.
 *
 * Planning is the first phase of a compute job: queued → planning → running
 */
"use strict";

const { createStep } = require("./job-model");

// Available tool categories that the planner can reference
const TOOL_CATALOG = Object.freeze({
  "file-read": {
    tools: ["readFile", "readFileRange", "readCurrentlyOpenFile"],
    description: "Read file contents",
  },
  "file-write": {
    tools: ["createNewFile", "editFile", "singleFindAndReplace", "multiEdit"],
    description: "Create or modify files",
  },
  "file-search": {
    tools: ["grepSearch", "globSearch", "viewSubdirectory", "ls"],
    description: "Search and browse files",
  },
  terminal: {
    tools: ["runTerminalCommand"],
    description: "Run terminal commands",
  },
  web: {
    tools: ["searchWeb", "fetchUrlContent"],
    description: "Web search and fetch (requires network)",
  },
  "code-nav": {
    tools: ["viewRepoMap", "viewDiff", "codebaseTool"],
    description: "Navigate codebase structure",
  },
});

// System prompt for the planner LLM
const PLANNER_SYSTEM_PROMPT = `You are a task planner for a coding assistant called CodeIn Compute.

Given a user's goal, break it down into concrete, ordered steps that can be executed by agents with tools.

RULES:
1. Each step must have: description, agent type, required tools
2. Steps execute sequentially — each step can use output from previous steps
3. Be specific: "Read src/index.ts" not "Look at the code"
4. Include verification steps (e.g., run tests after making changes)
5. If the task might fail, include fallback steps
6. Keep steps minimal — don't over-plan

AVAILABLE AGENTS:
- "coder": Writes, reads, edits code. Good for implementation.
- "analyst": Analyzes code, finds bugs, reviews. Good for investigation.
- "researcher": Searches web, fetches docs. Needs network access.
- "writer": Creates documentation, specs, reports. Good for writing.
- "default": General-purpose agent.

AVAILABLE TOOL CATEGORIES:
- file-read: Read file contents
- file-write: Create or edit files
- file-search: Search and browse the filesystem
- terminal: Run terminal commands
- web: Search web and fetch URLs (needs network permission)
- code-nav: Navigate codebase structure

OUTPUT FORMAT (strict JSON):
{
  "summary": "Brief summary of the plan",
  "steps": [
    {
      "description": "What this step does",
      "agentName": "coder|analyst|researcher|writer|default",
      "tools": ["toolName1", "toolName2"],
      "expectedArtifact": "file|report|diff|null",
      "dependsOn": []
    }
  ],
  "estimatedDuration": "short|medium|long",
  "requiresNetwork": false,
  "requiresFileWrite": true
}`;

class ComputePlanner {
  /**
   * @param {object} deps
   * @param {object} deps.modelRouter - ModelRouter instance for task routing
   * @param {object} deps.modelRuntime - ModelRuntimeManager for local inference
   * @param {object} [deps.externalProviders] - For escalation
   */
  constructor({
    modelRouter = null,
    modelRuntime = null,
    externalProviders = null,
  } = {}) {
    this.modelRouter = modelRouter;
    this.modelRuntime = modelRuntime;
    this.externalProviders = externalProviders;
  }

  /**
   * Generate an execution plan from a user goal.
   * @param {object} params
   * @param {string} params.goal - User's goal (in English or translated)
   * @param {object} params.policy - Job policy (affects available tools)
   * @param {object} [params.context] - Additional context (file listing, errors, etc.)
   * @returns {Promise<object>} Plan with steps
   */
  async plan({ goal, policy, context = {} }) {
    if (!goal || typeof goal !== "string") {
      throw new Error("Goal is required for planning");
    }

    // Build the planning prompt
    const userPrompt = this._buildPlanningPrompt(goal, policy, context);

    // Try local LLM first
    let planJson;
    try {
      planJson = await this._generatePlanLocal(userPrompt);
    } catch (localErr) {
      // If local fails and escalation is allowed, try external
      if (this.externalProviders && policy.allowEscalation) {
        try {
          planJson = await this._generatePlanExternal(userPrompt);
        } catch (extErr) {
          throw new Error(
            `Planning failed: local (${localErr.message}), external (${extErr.message})`,
          );
        }
      } else {
        // Fall back to heuristic planning
        planJson = this._heuristicPlan(goal, policy);
      }
    }

    // Parse and validate the plan
    const plan = this._parsePlan(planJson);

    // Convert to Step objects
    const steps = plan.steps.map((s) =>
      createStep({
        description: s.description,
        agentName: s.agentName || "default",
        tools: s.tools || [],
        input: {
          expectedArtifact: s.expectedArtifact || null,
          dependsOn: s.dependsOn || [],
        },
      }),
    );

    return {
      summary: plan.summary || `Execute: ${goal.slice(0, 100)}`,
      steps,
      estimatedDuration: plan.estimatedDuration || "medium",
      requiresNetwork: plan.requiresNetwork || false,
      requiresFileWrite: plan.requiresFileWrite || true,
      raw: plan,
    };
  }

  // ─── Private methods ───────────────────────────────────────

  _buildPlanningPrompt(goal, policy, context) {
    let prompt = `USER GOAL: ${goal}\n\n`;

    prompt += `CONSTRAINTS:\n`;
    prompt += `- Network access: ${policy.allowNetwork ? "YES" : "NO"}\n`;
    prompt += `- File write: ${policy.allowFSWrite ? "YES" : "NO"}\n`;
    prompt += `- Browser: ${policy.allowBrowser ? "YES" : "NO"}\n`;
    prompt += `- Max steps: ${policy.maxSteps}\n`;
    prompt += `- External API escalation: ${policy.allowEscalation ? "YES" : "NO"}\n`;

    if (context.files) {
      prompt += `\nAVAILABLE FILES:\n${context.files.slice(0, 50).join("\n")}\n`;
    }
    if (context.errors) {
      prompt += `\nCURRENT ERRORS:\n${context.errors.slice(0, 10).join("\n")}\n`;
    }
    if (context.description) {
      prompt += `\nADDITIONAL CONTEXT:\n${context.description}\n`;
    }

    prompt += `\nGenerate a plan in JSON format.`;
    return prompt;
  }

  async _generatePlanLocal(userPrompt) {
    if (!this.modelRuntime) {
      throw new Error("No local model runtime available");
    }

    // Route to a reasoning model
    let modelDecision;
    if (this.modelRouter) {
      modelDecision = this.modelRouter.route({
        prompt: userPrompt,
        mode: "plan",
        preference: "quality",
      });
    }

    // Call llama.cpp via HTTP
    const port = this.modelRuntime.currentPort || 43121;
    const http = require("node:http");

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        prompt: `<|im_start|>system\n${PLANNER_SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`,
        temperature: 0.3,
        max_tokens: 2048,
        stop: ["<|im_end|>"],
      });

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/completion",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 60000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed.content || parsed.choices?.[0]?.text || data);
            } catch {
              resolve(data);
            }
          });
        },
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Local LLM request timed out"));
      });

      req.write(body);
      req.end();
    });
  }

  async _generatePlanExternal(userPrompt) {
    if (!this.externalProviders) {
      throw new Error("No external providers available");
    }

    const messages = [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    const result = await this.externalProviders.completeWithFallback(
      messages,
      { maxTokens: 2048, temperature: 0.3 },
      ["gemini", "openai", "anthropic"], // cheapest first
    );

    return result.content;
  }

  /**
   * Heuristic fallback planning when no LLM is available.
   * Uses keyword matching to generate a basic plan.
   */
  _heuristicPlan(goal, policy) {
    const lower = goal.toLowerCase();
    const steps = [];

    // Detect intent from keywords
    const isBugFix = /\b(fix|bug|error|fail|crash|broken|issue)\b/i.test(lower);
    const isFeature = /\b(add|create|implement|build|feature|new)\b/i.test(
      lower,
    );
    const isRefactor = /\b(refactor|clean|improve|optimize|reorganize)\b/i.test(
      lower,
    );
    const isResearch =
      /\b(research|find|search|learn|investigate|explore)\b/i.test(lower);
    const isDoc = /\b(doc|document|readme|spec|guide|explain)\b/i.test(lower);
    const isTest = /\b(test|spec|coverage|verify|validate)\b/i.test(lower);

    // Always start with reading context
    steps.push({
      description: "Analyze project structure and relevant files",
      agentName: "analyst",
      tools: ["ls", "viewRepoMap", "grepSearch"],
      expectedArtifact: null,
    });

    if (isBugFix) {
      steps.push(
        {
          description: "Run tests to identify failures",
          agentName: "analyst",
          tools: ["runTerminalCommand"],
          expectedArtifact: "log",
        },
        {
          description: "Read error logs and failing test files",
          agentName: "analyst",
          tools: ["readFile", "grepSearch"],
          expectedArtifact: null,
        },
        {
          description: "Implement the fix",
          agentName: "coder",
          tools: ["editFile", "singleFindAndReplace"],
          expectedArtifact: "diff",
        },
        {
          description: "Re-run tests to verify fix",
          agentName: "analyst",
          tools: ["runTerminalCommand"],
          expectedArtifact: "log",
        },
      );
    } else if (isFeature) {
      steps.push(
        {
          description: "Read existing code to understand patterns",
          agentName: "analyst",
          tools: ["readFile", "grepSearch"],
          expectedArtifact: null,
        },
        {
          description: "Plan the implementation approach",
          agentName: "writer",
          tools: [],
          expectedArtifact: "report",
        },
        {
          description: "Implement the feature",
          agentName: "coder",
          tools: ["createNewFile", "editFile"],
          expectedArtifact: "code",
        },
        {
          description: "Add tests for new feature",
          agentName: "coder",
          tools: ["createNewFile"],
          expectedArtifact: "code",
        },
        {
          description: "Run tests to verify",
          agentName: "analyst",
          tools: ["runTerminalCommand"],
          expectedArtifact: "log",
        },
      );
    } else if (isRefactor) {
      steps.push(
        {
          description: "Identify code to refactor",
          agentName: "analyst",
          tools: ["readFile", "grepSearch"],
          expectedArtifact: "report",
        },
        {
          description: "Apply refactoring changes",
          agentName: "coder",
          tools: ["editFile", "singleFindAndReplace"],
          expectedArtifact: "diff",
        },
        {
          description: "Run tests to ensure nothing broke",
          agentName: "analyst",
          tools: ["runTerminalCommand"],
          expectedArtifact: "log",
        },
      );
    } else if (isResearch && policy.allowNetwork) {
      steps.push(
        {
          description: "Search for relevant information",
          agentName: "researcher",
          tools: ["searchWeb"],
          expectedArtifact: null,
        },
        {
          description: "Fetch and summarize key sources",
          agentName: "researcher",
          tools: ["fetchUrlContent"],
          expectedArtifact: "report",
        },
        {
          description: "Compile research findings",
          agentName: "writer",
          tools: ["createNewFile"],
          expectedArtifact: "report",
        },
      );
    } else if (isDoc) {
      steps.push(
        {
          description: "Read codebase to understand structure",
          agentName: "analyst",
          tools: ["readFile", "viewRepoMap"],
          expectedArtifact: null,
        },
        {
          description: "Generate documentation",
          agentName: "writer",
          tools: ["createNewFile"],
          expectedArtifact: "doc",
        },
      );
    } else if (isTest) {
      steps.push(
        {
          description: "Read code that needs testing",
          agentName: "analyst",
          tools: ["readFile", "grepSearch"],
          expectedArtifact: null,
        },
        {
          description: "Create test files",
          agentName: "coder",
          tools: ["createNewFile"],
          expectedArtifact: "code",
        },
        {
          description: "Run tests to verify they pass",
          agentName: "analyst",
          tools: ["runTerminalCommand"],
          expectedArtifact: "log",
        },
      );
    } else {
      // Generic plan
      steps.push(
        {
          description: "Understand the task requirements",
          agentName: "analyst",
          tools: ["readFile", "grepSearch"],
          expectedArtifact: null,
        },
        {
          description: "Execute the task",
          agentName: "coder",
          tools: ["createNewFile", "editFile"],
          expectedArtifact: "file",
        },
        {
          description: "Verify the result",
          agentName: "analyst",
          tools: ["readFile"],
          expectedArtifact: "report",
        },
      );
    }

    return {
      summary: `Plan for: ${goal.slice(0, 100)}`,
      steps,
      estimatedDuration:
        steps.length <= 3 ? "short" : steps.length <= 6 ? "medium" : "long",
      requiresNetwork: isResearch && policy.allowNetwork,
      requiresFileWrite: isFeature || isRefactor || isBugFix || isDoc || isTest,
    };
  }

  /**
   * Parse LLM output into a plan object.
   * Handles JSON in markdown blocks , raw JSON, and malformed output.
   */
  _parsePlan(raw) {
    if (typeof raw !== "string") {
      if (raw && typeof raw === "object" && raw.steps) return raw;
      throw new Error("Invalid plan output");
    }

    // Try to extract JSON from markdown code blocks
    const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const toParse = jsonMatch ? jsonMatch[1] : raw;

    // Try to find JSON object in the text
    const braceMatch = toParse.match(/\{[\s\S]*\}/);
    if (!braceMatch) {
      throw new Error("Could not find JSON plan in LLM output");
    }

    try {
      const plan = JSON.parse(braceMatch[0]);
      if (!plan.steps || !Array.isArray(plan.steps)) {
        throw new Error("Plan must contain a 'steps' array");
      }
      if (plan.steps.length === 0) {
        throw new Error("Plan must have at least one step");
      }
      if (plan.steps.length > 50) {
        throw new Error("Plan has too many steps (max 50)");
      }
      return plan;
    } catch (e) {
      if (e.message.includes("Plan")) throw e;
      throw new Error(`Failed to parse plan JSON: ${e.message}`);
    }
  }
}

module.exports = {
  ComputePlanner,
  PLANNER_SYSTEM_PROMPT,
  TOOL_CATALOG,
};
