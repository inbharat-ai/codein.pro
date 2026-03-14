/**
 * CodeIn MAS — Workflow Engine
 *
 * Extracts reusable templates from completed plans and allows
 * instantiation + execution of those templates with variable substitution.
 *
 * Templates are stored in persistence (SqliteMemoryStore) under "workflow:" prefix.
 */
"use strict";

const crypto = require("node:crypto");

const TEMPLATE_PREFIX = "workflow:";
const MAX_TEMPLATES = 200;
const MAX_TEMPLATE_NAME_LEN = 100;
const MAX_VARIABLE_KEY_LEN = 64;
const MAX_VARIABLE_VALUE_LEN = 10000;

// Placeholder pattern: {{variableName}}
const PLACEHOLDER_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/**
 * Extract variable placeholders from a string.
 * @param {string} str
 * @returns {string[]} unique variable names
 */
function extractPlaceholders(str) {
  if (typeof str !== "string") return [];
  const found = new Set();
  let m;
  while ((m = PLACEHOLDER_RE.exec(str)) !== null) {
    found.add(m[1]);
  }
  return [...found];
}

/**
 * Replace all {{var}} placeholders in a string with values from the map.
 * @param {string} str
 * @param {Record<string, string>} variables
 * @returns {string}
 */
function replacePlaceholders(str, variables) {
  if (typeof str !== "string") return str;
  return str.replace(PLACEHOLDER_RE, (match, name) => {
    if (name in variables) return String(variables[name]);
    return match; // leave unreplaced if not provided
  });
}

/**
 * Deep-clone a value, replacing all string placeholders.
 * @param {*} value
 * @param {Record<string, string>} variables
 * @returns {*}
 */
function deepReplace(value, variables) {
  if (typeof value === "string") return replacePlaceholders(value, variables);
  if (Array.isArray(value)) return value.map((v) => deepReplace(v, variables));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepReplace(v, variables);
    }
    return out;
  }
  return value;
}

class WorkflowEngine {
  /**
   * @param {object} opts
   * @param {object|null} opts.persistence - SqliteMemoryStore instance (or null for in-memory)
   * @param {object|null} opts.skillRegistry - SkillRegistry instance
   * @param {object|null} opts.executionEngine - AutonomousPlanner or SwarmManager for plan execution
   */
  constructor({
    persistence = null,
    skillRegistry = null,
    executionEngine = null,
  } = {}) {
    this._persistence = persistence;
    this._skillRegistry = skillRegistry;
    this._executionEngine = executionEngine;

    // In-memory fallback when persistence is not available
    this._memoryStore = new Map();
  }

  // ════════════════════════════════════════════════════════════
  // Persistence helpers
  // ════════════════════════════════════════════════════════════

  _key(name) {
    return `${TEMPLATE_PREFIX}${name}`;
  }

  _storeGet(key) {
    if (this._persistence && typeof this._persistence.get === "function") {
      const row = this._persistence.get(key);
      if (!row) return null;
      try {
        return typeof row === "string" ? JSON.parse(row) : row;
      } catch {
        return row;
      }
    }
    const val = this._memoryStore.get(key);
    return val !== undefined ? val : null;
  }

  _storeSet(key, value) {
    const serialized = JSON.stringify(value);
    if (this._persistence && typeof this._persistence.set === "function") {
      this._persistence.set(key, serialized);
      return;
    }
    this._memoryStore.set(key, value);
  }

  _storeDelete(key) {
    if (this._persistence && typeof this._persistence.delete === "function") {
      this._persistence.delete(key);
      return;
    }
    this._memoryStore.delete(key);
  }

  _storeKeys() {
    if (this._persistence && typeof this._persistence.keys === "function") {
      return this._persistence
        .keys()
        .filter((k) => k.startsWith(TEMPLATE_PREFIX));
    }
    return [...this._memoryStore.keys()].filter((k) =>
      k.startsWith(TEMPLATE_PREFIX),
    );
  }

  // ════════════════════════════════════════════════════════════
  // Template CRUD
  // ════════════════════════════════════════════════════════════

  /**
   * Save a completed plan as a reusable workflow template.
   *
   * @param {object} plan - A completed plan (from AutonomousPlanner)
   * @param {string} name - Template name (unique identifier)
   * @param {string} [description] - Human-readable description
   * @returns {object} The saved template
   */
  saveAsTemplate(plan, name, description = "") {
    // Validate name
    if (!name || typeof name !== "string") {
      throw new Error("Template name is required and must be a string");
    }
    const trimmedName = name.trim();
    if (
      trimmedName.length === 0 ||
      trimmedName.length > MAX_TEMPLATE_NAME_LEN
    ) {
      throw new Error(
        `Template name must be 1-${MAX_TEMPLATE_NAME_LEN} characters`,
      );
    }
    if (!/^[a-zA-Z0-9_\-. ]+$/.test(trimmedName)) {
      throw new Error(
        "Template name must contain only alphanumeric, hyphens, underscores, dots, and spaces",
      );
    }

    // Validate plan
    if (!plan || typeof plan !== "object") {
      throw new Error("Plan is required and must be an object");
    }
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error("Plan must have at least one step");
    }

    // Check template count limit
    const existingKeys = this._storeKeys();
    if (
      !this._storeGet(this._key(trimmedName)) &&
      existingKeys.length >= MAX_TEMPLATES
    ) {
      throw new Error(
        `Maximum of ${MAX_TEMPLATES} templates reached — delete unused templates first`,
      );
    }

    // Extract variables from step args/descriptions
    const allVariables = new Set();
    const templateSteps = plan.steps.map((step, idx) => {
      const placeholders = [
        ...extractPlaceholders(step.description || ""),
        ...extractPlaceholders(JSON.stringify(step.args || {})),
      ];
      placeholders.forEach((v) => allVariables.add(v));

      return {
        id: step.id || `step_${idx}`,
        description: step.description || "",
        agentType: step.agentType || null,
        args: step.args || {},
        dependsOn: step.dependsOn || [],
      };
    });

    // Extract edges (dependencies)
    const edges = [];
    for (const step of templateSteps) {
      for (const dep of step.dependsOn) {
        edges.push({ from: dep, to: step.id });
      }
    }

    const template = {
      name: trimmedName,
      description: description || "",
      category: plan.category || "general",
      variables: [...allVariables].map((v) => ({
        name: v,
        description: "",
        required: true,
      })),
      steps: templateSteps,
      edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceGoal: plan.goal || "",
      usageCount: 0,
    };

    this._storeSet(this._key(trimmedName), template);
    return template;
  }

  /**
   * List all saved templates, optionally filtered by category.
   *
   * @param {string} [category] - Filter by category
   * @returns {object[]} Array of template summaries
   */
  listTemplates(category) {
    const keys = this._storeKeys();
    const templates = [];

    for (const key of keys) {
      const tmpl = this._storeGet(key);
      if (!tmpl) continue;
      if (category && tmpl.category !== category) continue;

      templates.push({
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        variables: tmpl.variables,
        stepCount: tmpl.steps ? tmpl.steps.length : 0,
        createdAt: tmpl.createdAt,
        usageCount: tmpl.usageCount || 0,
      });
    }

    return templates;
  }

  /**
   * Get a single template by name.
   *
   * @param {string} name
   * @returns {object|null}
   */
  getTemplate(name) {
    if (!name || typeof name !== "string") return null;
    return this._storeGet(this._key(name.trim()));
  }

  /**
   * Delete a template by name.
   *
   * @param {string} name
   * @returns {{ success: boolean }}
   */
  deleteTemplate(name) {
    if (!name || typeof name !== "string") {
      return { success: false, error: "Template name is required" };
    }
    const key = this._key(name.trim());
    const existing = this._storeGet(key);
    if (!existing) {
      return { success: false, error: "Template not found" };
    }
    this._storeDelete(key);
    return { success: true };
  }

  /**
   * Create a concrete plan from a template + variable values.
   * Replace all {{placeholder}} values in step args and descriptions.
   *
   * @param {string} templateName
   * @param {Record<string, string>} variables - Variable values to substitute
   * @returns {object} A concrete plan ready for execution
   */
  instantiate(templateName, variables = {}) {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template "${templateName}" not found`);
    }

    // Validate variables
    if (typeof variables !== "object" || variables === null) {
      throw new Error("Variables must be an object");
    }

    // Validate variable keys and values
    for (const [k, v] of Object.entries(variables)) {
      if (k.length > MAX_VARIABLE_KEY_LEN) {
        throw new Error(
          `Variable key "${k.slice(0, 20)}..." exceeds ${MAX_VARIABLE_KEY_LEN} characters`,
        );
      }
      if (typeof v === "string" && v.length > MAX_VARIABLE_VALUE_LEN) {
        throw new Error(
          `Variable value for "${k}" exceeds ${MAX_VARIABLE_VALUE_LEN} characters`,
        );
      }
    }

    // Check for missing required variables
    const required = (template.variables || [])
      .filter((v) => v.required)
      .map((v) => v.name);
    const missing = required.filter((v) => !(v in variables));
    if (missing.length > 0) {
      throw new Error(`Missing required variables: ${missing.join(", ")}`);
    }

    // Create concrete plan by replacing placeholders
    const planId = `plan-${crypto.randomBytes(4).toString("hex")}`;
    const concreteSteps = template.steps.map((step, idx) => ({
      id: `${planId}_step_${idx}`,
      description: replacePlaceholders(step.description, variables),
      agentType: step.agentType,
      args: deepReplace(step.args, variables),
      dependsOn: step.dependsOn || [],
      status: "pending",
      result: null,
      error: null,
      retryCount: 0,
    }));

    // Update usage count
    template.usageCount = (template.usageCount || 0) + 1;
    template.updatedAt = new Date().toISOString();
    this._storeSet(this._key(template.name), template);

    return {
      id: planId,
      goal: replacePlaceholders(
        template.sourceGoal || template.description,
        variables,
      ),
      steps: concreteSteps,
      status: "pending",
      templateName: template.name,
      variables,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Instantiate a template and execute it in one call.
   *
   * @param {string} templateName
   * @param {Record<string, string>} variables
   * @param {object} [context] - Execution context
   * @returns {Promise<object>} Execution result
   */
  async runTemplate(templateName, variables = {}, context = {}) {
    const plan = this.instantiate(templateName, variables);

    if (!this._executionEngine) {
      return {
        ...plan,
        status: "error",
        error:
          "Execution engine not available — template instantiated but not executed",
      };
    }

    // If the engine has a `run` method (AutonomousPlanner), use it
    if (typeof this._executionEngine.run === "function") {
      const result = await this._executionEngine.run(plan.goal, {
        ...context,
        templatePlan: plan,
      });
      return {
        ...plan,
        status: result.status || "completed",
        executionResult: result,
      };
    }

    // If the engine has a `taskOrchestrate` method (SwarmManager), use it
    if (typeof this._executionEngine.taskOrchestrate === "function") {
      const result = await this._executionEngine.taskOrchestrate({
        goal: plan.goal,
        mode: "implement",
        context: { ...context, templatePlan: plan },
      });
      return {
        ...plan,
        status: result.status || "completed",
        executionResult: result,
      };
    }

    return {
      ...plan,
      status: "error",
      error: "Execution engine has no compatible run method",
    };
  }
}

module.exports = {
  WorkflowEngine,
  extractPlaceholders,
  replacePlaceholders,
  deepReplace,
};
