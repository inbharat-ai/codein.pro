"use strict";

/**
 * Route contract definitions for CodeIn API.
 * Each contract specifies method, path, request shape, and response shape.
 * Used for validation, documentation, and frontend/backend contract stability.
 *
 * Usage:
 *   const { CONTRACTS, validateResponse, getContract } = require('./api-contracts');
 *   const result = validateResponse("GET /swarm/status", responseObj);
 *   if (!result.valid) console.error(result.errors);
 */

const CONTRACTS = Object.freeze({
  // ─── Swarm Lifecycle ──────────────────────────
  "POST /swarm/init": {
    description: "Initialize swarm with optional configuration",
    request: {
      body: {
        topology: {
          type: "string",
          enum: ["mesh", "hierarchical", "ring", "star"],
          optional: true,
        },
        maxAgents: { type: "number", optional: true },
        budgetUSD: { type: "number", optional: true },
        language: { type: "string", optional: true },
      },
    },
    response: {
      status: { type: "string" },
      config: { type: "object" },
      warnings: { type: "array", items: "string" },
    },
  },

  "POST /swarm/tasks": {
    description: "Submit a task to the swarm",
    request: {
      body: {
        goal: { type: "string", required: true },
        mode: {
          type: "string",
          enum: ["single", "multi", "auto"],
          optional: true,
        },
        context: { type: "object", optional: true },
      },
    },
    response: {
      taskId: { type: "string" },
      status: { type: "string" },
      nodes: { type: "array" },
      metadata: { type: "object" },
    },
  },

  "GET /swarm/status": {
    description: "Get current swarm state and agent list",
    response: {
      state: { type: "string" },
      agents: { type: "array" },
      activeTasks: { type: "number" },
    },
  },

  "POST /swarm/shutdown": {
    description: "Shut down the swarm gracefully",
    response: {
      status: { type: "string" },
      agentsReleased: { type: "number" },
    },
  },

  // ─── AI Hub ──────────────────────────
  "GET /ai-hub/providers": {
    description: "List all registered providers with status",
    response: {
      providers: { type: "array", items: "ProviderStatus" },
    },
  },

  "POST /ai-hub/providers/:id/key": {
    description: "Store an API key for a provider",
    request: {
      body: {
        key: { type: "string", required: true },
      },
    },
    response: {
      success: { type: "boolean" },
      provider: { type: "string" },
      keyHint: { type: "string" },
    },
  },

  "POST /ai-hub/providers/:id/test": {
    description: "Test connectivity to a provider",
    response: {
      success: { type: "boolean" },
      latencyMs: { type: "number" },
      modelCount: { type: "number", optional: true },
      error: { type: "string", optional: true },
    },
  },

  "GET /ai-hub/providers/:id/models": {
    description: "List models available from a provider",
    response: {
      models: { type: "array", items: "NormalizedModel" },
      provider: { type: "string" },
    },
  },

  "POST /ai-hub/chat/completions": {
    description: "Send a chat completion request",
    request: {
      body: {
        model: { type: "string", required: true },
        messages: { type: "array", required: true },
        stream: { type: "boolean", optional: true },
        temperature: { type: "number", optional: true },
        maxTokens: { type: "number", optional: true },
      },
    },
    response: {
      content: { type: "string" },
      model: { type: "string" },
      provider: { type: "string" },
      usage: { type: "object" },
      finishReason: { type: "string" },
    },
  },

  // ─── Terminal ──────────────────────────
  "POST /swarm/terminal/sessions/:sessionId/execute": {
    description: "Execute a command in a terminal session",
    request: {
      body: {
        command: { type: "string", required: true },
        opts: { type: "object", optional: true },
      },
    },
    response: {
      stdout: { type: "string" },
      stderr: { type: "string" },
      exitCode: { type: "number" },
    },
  },

  // ─── Git ──────────────────────────
  "GET /swarm/git/status": {
    description: "Get git repository status",
    response: {
      branch: { type: "string" },
      files: { type: "array" },
      ahead: { type: "number" },
      behind: { type: "number" },
      clean: { type: "boolean" },
    },
  },

  "POST /swarm/git/branch": {
    description: "Create a new git branch",
    request: {
      body: {
        name: { type: "string", required: true },
        base: { type: "string", optional: true },
      },
    },
    response: {
      branch: { type: "string" },
    },
  },

  "POST /swarm/git/stage": {
    description: "Stage files for commit",
    request: {
      body: {
        files: { type: "array", items: "string", required: true },
      },
    },
    response: {
      success: { type: "boolean" },
    },
  },

  "POST /swarm/git/commit": {
    description: "Create a git commit",
    request: {
      body: {
        message: { type: "string", required: true },
      },
    },
    response: {
      hash: { type: "string" },
      message: { type: "string" },
    },
  },

  // ─── Permissions ──────────────────────────
  "GET /swarm/permissions/pending": {
    description: "List pending permission requests",
    response: {
      requests: { type: "array", items: "PermissionRequest" },
    },
  },

  "POST /swarm/permissions/:id/approve": {
    description: "Approve a permission request",
    request: {
      body: {
        permanent: { type: "boolean", optional: true },
      },
    },
    response: {
      granted: { type: "boolean" },
      requestId: { type: "string" },
    },
  },

  "POST /swarm/permissions/:id/deny": {
    description: "Deny a permission request",
    response: {
      granted: { type: "boolean" },
      requestId: { type: "string" },
    },
  },

  // ─── Sessions ──────────────────────────
  "GET /sessions": {
    description: "List active sessions",
    response: {
      sessions: { type: "array" },
    },
  },

  "POST /sessions": {
    description: "Create a new session",
    request: {
      body: {
        projectPath: { type: "string", required: true },
      },
    },
    response: {
      sessionId: { type: "string" },
      projectPath: { type: "string" },
    },
  },
});

/**
 * Validate a response object against a contract.
 * @param {string} contractKey - e.g. "GET /swarm/status"
 * @param {object} response - the response body to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateResponse(contractKey, response) {
  const contract = CONTRACTS[contractKey];
  if (!contract)
    return { valid: false, errors: [`Unknown contract: ${contractKey}`] };

  const errors = [];
  const schema = contract.response;

  if (!schema) return { valid: true, errors: [] };

  for (const [field, spec] of Object.entries(schema)) {
    if (spec.optional && !(field in response)) continue;

    if (!spec.optional && !(field in response)) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }

    const val = response[field];

    // Null check
    if (val === null || val === undefined) {
      if (!spec.optional) {
        errors.push(`${field} is ${val}`);
      }
      continue;
    }

    // Type checking
    if (spec.type === "array") {
      if (!Array.isArray(val)) {
        errors.push(`${field} should be array, got ${typeof val}`);
      }
    } else if (spec.type === "object") {
      if (typeof val !== "object" || Array.isArray(val)) {
        errors.push(
          `${field} should be object, got ${Array.isArray(val) ? "array" : typeof val}`,
        );
      }
    } else if (typeof val !== spec.type) {
      errors.push(`${field} should be ${spec.type}, got ${typeof val}`);
    }

    // Enum check
    if (spec.enum && !spec.enum.includes(val)) {
      errors.push(`${field} must be one of: ${spec.enum.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a request body against a contract.
 * @param {string} contractKey - e.g. "POST /swarm/tasks"
 * @param {object} body - the request body to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRequest(contractKey, body) {
  const contract = CONTRACTS[contractKey];
  if (!contract)
    return { valid: false, errors: [`Unknown contract: ${contractKey}`] };

  const errors = [];
  const schema = contract.request && contract.request.body;

  if (!schema) return { valid: true, errors: [] };

  for (const [field, spec] of Object.entries(schema)) {
    if (spec.required && !(field in body)) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }

    if (!(field in body)) continue;

    const val = body[field];

    if (spec.type === "array") {
      if (!Array.isArray(val)) {
        errors.push(`${field} should be array, got ${typeof val}`);
      }
    } else if (spec.type === "object") {
      if (typeof val !== "object" || Array.isArray(val)) {
        errors.push(
          `${field} should be object, got ${Array.isArray(val) ? "array" : typeof val}`,
        );
      }
    } else if (typeof val !== spec.type) {
      errors.push(`${field} should be ${spec.type}, got ${typeof val}`);
    }

    if (spec.enum && !spec.enum.includes(val)) {
      errors.push(`${field} must be one of: ${spec.enum.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the contract for a route.
 * @param {string} method - HTTP method
 * @param {string} path - Route path
 * @returns {object|null}
 */
function getContract(method, path) {
  return CONTRACTS[`${method.toUpperCase()} ${path}`] || null;
}

/**
 * List all defined contract keys.
 * @returns {string[]}
 */
function listContracts() {
  return Object.keys(CONTRACTS);
}

module.exports = {
  CONTRACTS,
  validateResponse,
  validateRequest,
  getContract,
  listContracts,
};
