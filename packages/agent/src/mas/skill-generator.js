/**
 * CodeIn MAS — Skill Generator
 *
 * Generates new skills on-demand when no existing skill matches a task.
 * Uses the LLM to write Node.js code, validates it for safety,
 * tests it in the Docker sandbox, and registers it in the skill registry.
 *
 * Safety guarantees:
 *   - Generated code ONLY runs inside a sandbox (Docker or VM)
 *   - Static analysis blocks dangerous patterns (child_process, eval, etc.)
 *   - Code size capped at 10 KB
 *   - Max 3 generation attempts per task
 *   - Generated skills receive trustLevel: "generated" requiring permission on first use
 */
"use strict";

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MAX_CODE_SIZE = 10 * 1024; // 10 KB
const MAX_GENERATION_ATTEMPTS = 3;

/** Patterns that are never allowed in generated code */
const DANGEROUS_PATTERNS = [
  /require\s*\(\s*['"`]child_process['"`]\s*\)/,
  /require\s*\(\s*['"`]node:child_process['"`]\s*\)/,
  /require\s*\(\s*['"`]fs['"`]\s*\)[\s\S]{0,50}\.rmSync/,
  /require\s*\(\s*['"`]node:fs['"`]\s*\)[\s\S]{0,50}\.rmSync/,
  /\bprocess\s*\.\s*exit\s*\(/,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\brequire\s*\(\s*['"`]cluster['"`]\s*\)/,
  /\brequire\s*\(\s*['"`]node:cluster['"`]\s*\)/,
  /\brequire\s*\(\s*['"`]worker_threads['"`]\s*\)/,
  /\brequire\s*\(\s*['"`]node:worker_threads['"`]\s*\)/,
  /\brequire\s*\(\s*['"`]dgram['"`]\s*\)/,
  /\brequire\s*\(\s*['"`]node:dgram['"`]\s*\)/,
  /\brequire\s*\(\s*['"`]net['"`]\s*\)/,
  /\brequire\s*\(\s*['"`]node:net['"`]\s*\)/,
];

// ═══════════════════════════════════════════════════════════════
// SkillGenerator
// ═══════════════════════════════════════════════════════════════

class SkillGenerator extends EventEmitter {
  /**
   * @param {object} opts
   * @param {Function}  opts.runLLM         — async (prompt, opts) => string | { text }
   * @param {object}    [opts.sandbox]      — DockerSandbox instance
   * @param {object}    [opts.skillRegistry] — EnhancedSkillRegistry instance
   * @param {object}    [opts.auditTrail]   — AuditTrail instance
   */
  constructor({
    runLLM,
    sandbox = null,
    skillRegistry = null,
    auditTrail = null,
  }) {
    super();

    if (!runLLM || typeof runLLM !== "function") {
      throw new Error("SkillGenerator requires a runLLM function");
    }

    this._runLLM = runLLM;
    this._sandbox = sandbox;
    this._skillRegistry = skillRegistry;
    this._auditTrail = auditTrail;

    /** @type {Map<string, object>} generated skill name -> metadata */
    this._generatedSkills = new Map();
  }

  // ─── Public API ─────────────────────────────────────────────

  /**
   * Generate a new skill for the given task description.
   *
   * 1. Asks LLM to produce a skill definition (name, code, schemas)
   * 2. Validates the code for dangerous patterns
   * 3. If sandbox is available, tests with LLM-generated test inputs
   * 4. Registers the skill with trustLevel "generated"
   * 5. Records the event in the audit trail
   *
   * @param {string} taskDescription — What the skill should do
   * @param {object} [context]       — Workspace info, files involved, etc.
   * @returns {Promise<{ success: boolean, skillName?: string, skill?: object, error?: string }>}
   */
  async generateSkill(taskDescription, context = {}) {
    if (!taskDescription || typeof taskDescription !== "string") {
      return { success: false, error: "Task description is required" };
    }

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        this.emit("generation:attempt", { taskDescription, attempt });

        // 1. Ask LLM to generate the skill definition
        const skillDef = await this._askLLMForSkill(
          taskDescription,
          context,
          lastError,
        );

        // 2. Validate the generated code
        const validation = this._validateCode(skillDef.code);
        if (!validation.valid) {
          lastError = `Validation failed: ${validation.errors.join(", ")}`;
          this.emit("generation:validation_failed", {
            attempt,
            errors: validation.errors,
          });
          continue;
        }

        // 3. Test in sandbox if available
        if (this._sandbox) {
          const testResult = await this._testInSandbox(skillDef);
          if (!testResult.passed) {
            lastError = `Sandbox test failed: ${testResult.error}`;
            this.emit("generation:sandbox_failed", {
              attempt,
              error: testResult.error,
            });
            continue;
          }
        }

        // 4. Wrap and register the skill
        const skill = this._wrapAsSkill(skillDef.name, skillDef.code, {
          description: skillDef.description,
          category: skillDef.category || "analysis",
          inputSchema: skillDef.inputSchema || null,
          outputSchema: skillDef.outputSchema || null,
        });

        if (this._skillRegistry) {
          try {
            // Unregister if it already exists (re-generation case)
            if (this._skillRegistry.getSkill(skillDef.name)) {
              this._skillRegistry.unregisterSkill(skillDef.name);
            }
            this._skillRegistry.registerSkill(skill);
          } catch (regErr) {
            return {
              success: false,
              error: `Registration failed: ${regErr.message}`,
            };
          }
        }

        this._generatedSkills.set(skillDef.name, {
          ...skillDef,
          generatedAt: Date.now(),
          attempts: attempt,
        });

        // 5. Record in audit trail
        if (this._auditTrail) {
          this._auditTrail.record({
            action: "skill_generated",
            skillName: skillDef.name,
            metadata: {
              taskDescription,
              attempts: attempt,
              codeSize: skillDef.code.length,
              sandboxTested: !!this._sandbox,
            },
          });
        }

        this.emit("generation:success", {
          skillName: skillDef.name,
          attempts: attempt,
        });

        return {
          success: true,
          skillName: skillDef.name,
          skill,
        };
      } catch (err) {
        lastError = err.message;
        this.emit("generation:error", { attempt, error: err.message });
      }
    }

    // All attempts exhausted
    this.emit("generation:exhausted", { taskDescription, lastError });

    if (this._auditTrail) {
      this._auditTrail.record({
        action: "skill_generated",
        skillName: null,
        error: lastError,
        metadata: {
          taskDescription,
          attempts: MAX_GENERATION_ATTEMPTS,
          exhausted: true,
        },
      });
    }

    return {
      success: false,
      error: `Failed after ${MAX_GENERATION_ATTEMPTS} attempts. Last error: ${lastError}`,
    };
  }

  /**
   * Refine an existing generated skill based on feedback.
   *
   * @param {string} skillName — Name of the skill to refine
   * @param {string} feedback  — What needs to change
   * @returns {Promise<{ success: boolean, skillName?: string, skill?: object, error?: string }>}
   */
  async refineSkill(skillName, feedback) {
    if (!skillName || typeof skillName !== "string") {
      return { success: false, error: "Skill name is required" };
    }
    if (!feedback || typeof feedback !== "string") {
      return { success: false, error: "Feedback is required" };
    }

    const existing = this._generatedSkills.get(skillName);
    if (!existing) {
      return {
        success: false,
        error: `Skill "${skillName}" was not generated by this instance`,
      };
    }

    const prompt = [
      "You previously generated a skill with this code:",
      "```javascript",
      existing.code,
      "```",
      "",
      `Skill name: ${existing.name}`,
      `Description: ${existing.description}`,
      "",
      "The user provided this feedback:",
      feedback,
      "",
      "Generate an improved version. Respond with ONLY valid JSON:",
      '{ "name": "...", "description": "...", "category": "...", "code": "...", "inputSchema": {...}, "outputSchema": {...} }',
    ].join("\n");

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const raw = await this._runLLM(prompt, { maxTokens: 4096 });
        const text = typeof raw === "string" ? raw : raw.text || "";
        const skillDef = this._parseLLMResponse(text);

        // Keep the original name
        skillDef.name = skillName;

        const validation = this._validateCode(skillDef.code);
        if (!validation.valid) {
          lastError = `Validation failed: ${validation.errors.join(", ")}`;
          continue;
        }

        if (this._sandbox) {
          const testResult = await this._testInSandbox(skillDef);
          if (!testResult.passed) {
            lastError = `Sandbox test failed: ${testResult.error}`;
            continue;
          }
        }

        const skill = this._wrapAsSkill(skillDef.name, skillDef.code, {
          description: skillDef.description,
          category: skillDef.category || existing.category || "analysis",
          inputSchema: skillDef.inputSchema || existing.inputSchema || null,
          outputSchema: skillDef.outputSchema || existing.outputSchema || null,
        });

        if (this._skillRegistry) {
          if (this._skillRegistry.getSkill(skillName)) {
            this._skillRegistry.unregisterSkill(skillName);
          }
          this._skillRegistry.registerSkill(skill);
        }

        // Update local record
        this._generatedSkills.set(skillName, {
          ...skillDef,
          generatedAt: existing.generatedAt,
          refinedAt: Date.now(),
          attempts: existing.attempts + attempt,
        });

        if (this._auditTrail) {
          this._auditTrail.record({
            action: "skill_generated",
            skillName,
            metadata: { refined: true, feedback, attempts: attempt },
          });
        }

        this.emit("refine:success", { skillName, attempts: attempt });
        return { success: true, skillName, skill };
      } catch (err) {
        lastError = err.message;
      }
    }

    return {
      success: false,
      error: `Refinement failed after ${MAX_GENERATION_ATTEMPTS} attempts. Last error: ${lastError}`,
    };
  }

  // ─── Code Validation ───────────────────────────────────────

  /**
   * Static analysis of generated code for dangerous patterns.
   *
   * @param {string} code
   * @returns {{ valid: boolean, errors: string[] }}
   */
  _validateCode(code) {
    const errors = [];

    if (!code || typeof code !== "string") {
      errors.push("Code must be a non-empty string");
      return { valid: false, errors };
    }

    // Size check
    if (Buffer.byteLength(code, "utf-8") > MAX_CODE_SIZE) {
      errors.push(
        `Code exceeds maximum size of ${MAX_CODE_SIZE} bytes (10 KB)`,
      );
    }

    // Dangerous pattern check
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

    // Syntax check — try to parse as a function body
    try {
      new Function(code);
    } catch (syntaxErr) {
      errors.push(`Syntax error: ${syntaxErr.message}`);
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── Internal: LLM Interaction ─────────────────────────────

  /**
   * Ask the LLM to generate a skill definition.
   * @private
   */
  async _askLLMForSkill(taskDescription, context, previousError) {
    const contextStr =
      Object.keys(context).length > 0
        ? `\nWorkspace context:\n${JSON.stringify(context, null, 2)}`
        : "";

    const retryHint = previousError
      ? `\n\nPrevious attempt failed: ${previousError}\nPlease fix the issue.`
      : "";

    const prompt = [
      "Generate a Node.js skill function for the following task:",
      "",
      `Task: ${taskDescription}`,
      contextStr,
      retryHint,
      "",
      "Requirements:",
      "- The code should be a single async function body",
      "- Do NOT use require('child_process'), eval(), new Function(), or process.exit()",
      "- Do NOT use require('fs').rmSync or any destructive file operations",
      "- Keep the code under 10KB",
      "- The function receives (input) as its argument and must return a result object",
      "",
      "Respond with ONLY valid JSON in this exact format:",
      "{",
      '  "name": "kebab-case-skill-name",',
      '  "description": "What this skill does",',
      '  "category": "analysis|code_gen|data|file_ops|terminal|git|browser|api|testing|deployment",',
      '  "code": "async function execute(input) { ... return { result }; }",',
      '  "inputSchema": { "type": "object", "properties": {...}, "required": [...] },',
      '  "outputSchema": { "type": "object", "properties": {...} }',
      "}",
    ].join("\n");

    const raw = await this._runLLM(prompt, { maxTokens: 4096 });
    const text = typeof raw === "string" ? raw : raw.text || "";
    return this._parseLLMResponse(text);
  }

  /**
   * Parse the LLM response into a skill definition.
   * @private
   */
  _parseLLMResponse(text) {
    // Try to extract JSON from the response
    let jsonStr = text.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    // Try direct JSON parse
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try to find the first { ... } block
      const braceStart = jsonStr.indexOf("{");
      const braceEnd = jsonStr.lastIndexOf("}");
      if (braceStart >= 0 && braceEnd > braceStart) {
        try {
          parsed = JSON.parse(jsonStr.slice(braceStart, braceEnd + 1));
        } catch (e2) {
          throw new Error(
            `Failed to parse LLM response as JSON: ${e2.message}`,
          );
        }
      } else {
        throw new Error("LLM response did not contain valid JSON");
      }
    }

    // Validate required fields
    if (!parsed.name || typeof parsed.name !== "string") {
      throw new Error("LLM response missing required field: name");
    }
    if (!parsed.code || typeof parsed.code !== "string") {
      throw new Error("LLM response missing required field: code");
    }

    // Sanitize skill name to kebab-case
    parsed.name = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    if (!parsed.name) {
      parsed.name = `generated-skill-${crypto.randomBytes(4).toString("hex")}`;
    }

    return {
      name: parsed.name,
      description: parsed.description || "",
      category: parsed.category || "analysis",
      code: parsed.code,
      inputSchema: parsed.inputSchema || null,
      outputSchema: parsed.outputSchema || null,
    };
  }

  // ─── Internal: Sandbox Testing ─────────────────────────────

  /**
   * Generate test inputs via LLM, run the code in the sandbox, validate results.
   * @private
   */
  async _testInSandbox(skillDef) {
    try {
      // Generate test inputs
      const testInputs = await this._generateTestInputs(
        skillDef.code,
        skillDef.inputSchema,
      );

      for (let i = 0; i < testInputs.length; i++) {
        const testCode = [
          skillDef.code,
          "",
          "// === Test execution ===",
          `const testInput = ${JSON.stringify(testInputs[i])};`,
          "",
          "async function runTest() {",
          "  try {",
          "    const result = await execute(testInput);",
          "    console.log(JSON.stringify({ success: true, result }));",
          "  } catch (err) {",
          "    console.log(JSON.stringify({ success: false, error: err.message }));",
          "  }",
          "}",
          "",
          "runTest();",
        ].join("\n");

        const sandboxResult = await this._sandbox.execute({
          code: testCode,
          runtime: "node",
        });

        if (sandboxResult.exitCode !== 0) {
          return {
            passed: false,
            error: `Test ${i + 1} exited with code ${sandboxResult.exitCode}: ${sandboxResult.stderr}`,
          };
        }

        // Try to parse the output to verify it ran successfully
        try {
          const output = JSON.parse(sandboxResult.stdout.trim());
          if (!output.success) {
            return {
              passed: false,
              error: `Test ${i + 1} execution error: ${output.error}`,
            };
          }
        } catch {
          // Non-JSON output is acceptable if exit code was 0
        }
      }

      return { passed: true };
    } catch (err) {
      return { passed: false, error: err.message };
    }
  }

  /**
   * Use the LLM to generate 2-3 test inputs for the skill code.
   * @private
   */
  async _generateTestInputs(code, inputSchema) {
    try {
      const schemaStr = inputSchema ? JSON.stringify(inputSchema) : "unknown";
      const prompt = [
        "Generate 2-3 test inputs (as a JSON array) for this function:",
        "```javascript",
        code.slice(0, 3000),
        "```",
        "",
        `Input schema: ${schemaStr}`,
        "",
        "Respond with ONLY a valid JSON array of test input objects. Example: [{ ... }, { ... }]",
      ].join("\n");

      const raw = await this._runLLM(prompt, { maxTokens: 1024 });
      const text = typeof raw === "string" ? raw : raw.text || "";

      let jsonStr = text.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }

      const bracketStart = jsonStr.indexOf("[");
      const bracketEnd = jsonStr.lastIndexOf("]");
      if (bracketStart >= 0 && bracketEnd > bracketStart) {
        jsonStr = jsonStr.slice(bracketStart, bracketEnd + 1);
      }

      const inputs = JSON.parse(jsonStr);
      if (Array.isArray(inputs) && inputs.length > 0) {
        return inputs.slice(0, 3);
      }
    } catch {
      // Fall back to empty-object test input
    }

    return [{}];
  }

  // ─── Internal: Skill Wrapping ──────────────────────────────

  /**
   * Create a full skill definition suitable for EnhancedSkillRegistry.registerSkill().
   * The execute function runs the generated code in the sandbox for safety.
   *
   * @param {string} name
   * @param {string} code
   * @param {object} metadata
   * @returns {object} Skill definition
   */
  _wrapAsSkill(name, code, metadata) {
    const sandbox = this._sandbox;

    const execute = async (ctx) => {
      const wrappedCode = [
        code,
        "",
        `const __input = ${JSON.stringify(ctx)};`,
        "",
        "async function __run() {",
        "  try {",
        "    const result = await execute(__input);",
        "    console.log(JSON.stringify({ __ok: true, result }));",
        "  } catch (err) {",
        "    console.log(JSON.stringify({ __ok: false, error: err.message }));",
        "  }",
        "}",
        "",
        "__run();",
      ].join("\n");

      if (sandbox) {
        const res = await sandbox.execute({
          code: wrappedCode,
          runtime: "node",
        });
        if (res.exitCode !== 0) {
          throw new Error(
            `Skill execution failed (exit ${res.exitCode}): ${res.stderr}`,
          );
        }
        try {
          const output = JSON.parse(res.stdout.trim());
          if (!output.__ok) {
            throw new Error(output.error || "Skill returned failure");
          }
          return output.result;
        } catch (parseErr) {
          if (parseErr.message.includes("Skill")) throw parseErr;
          // Return raw stdout if not JSON
          return { rawOutput: res.stdout };
        }
      }

      // No sandbox — refuse to run generated code outside of sandbox
      throw new Error(
        "Cannot execute generated skill: no sandbox available. " +
          "Generated skills require Docker sandbox for safe execution.",
      );
    };

    return {
      name,
      description: metadata.description || "",
      category: metadata.category || "analysis",
      trustLevel: "generated",
      requiredPermissions: [],
      execute,
      executeSource: code,
      inputSchema: metadata.inputSchema || null,
      outputSchema: metadata.outputSchema || null,
      estimatedTokens: 0,
      estimatedTimeMs: 10000,
      agentTypes: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  SkillGenerator,
  MAX_CODE_SIZE,
  MAX_GENERATION_ATTEMPTS,
  DANGEROUS_PATTERNS,
};
