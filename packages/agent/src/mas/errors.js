/**
 * CodIn MAS — Error Types
 *
 * Structured error hierarchy for the multi-agent swarm subsystem.
 * Every error carries a code, context, and is instanceof its category.
 */
"use strict";

/**
 * Base error for all MAS errors.
 * Carries a machine-readable `code` and optional `context` bag.
 */
class SwarmError extends Error {
  /**
   * @param {string} message — Human-readable description
   * @param {string} code — Machine-readable code (e.g. "PERMISSION_DENIED")
   * @param {object} [context={}] — Structured metadata for logging
   */
  constructor(message, code, context = {}) {
    super(message);
    this.name = "SwarmError";
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/** Permission was denied for a requested action. */
class PermissionDeniedError extends SwarmError {
  constructor(action, reason, context = {}) {
    super(`Permission denied: ${action} — ${reason}`, "PERMISSION_DENIED", {
      action,
      reason,
      ...context,
    });
    this.name = "PermissionDeniedError";
  }
}

/** Path traversal or unsafe file access attempted. */
class PathTraversalError extends SwarmError {
  constructor(requestedPath, workspaceRoot) {
    super(
      `Path traversal detected: ${requestedPath} is outside ${workspaceRoot}`,
      "PATH_TRAVERSAL",
      { requestedPath, workspaceRoot },
    );
    this.name = "PathTraversalError";
  }
}

/** A command was not in the agent's allowlist. */
class CommandNotAllowedError extends SwarmError {
  constructor(command, allowedCommands = []) {
    super(`Command not allowed: ${command}`, "COMMAND_NOT_ALLOWED", {
      command,
      allowedCommands,
    });
    this.name = "CommandNotAllowedError";
  }
}

/** Secret content detected in a write operation. */
class SecretDetectedError extends SwarmError {
  constructor(path, patternSource) {
    super(
      `Security: content for ${path} appears to contain secrets (matched ${patternSource}). Use environment variables instead.`,
      "SECRET_DETECTED",
      { path, patternSource },
    );
    this.name = "SecretDetectedError";
  }
}

/** Tool argument validation failed. */
class ToolValidationError extends SwarmError {
  constructor(toolName, message, context = {}) {
    super(`Tool ${toolName}: ${message}`, "TOOL_VALIDATION", {
      toolName,
      ...context,
    });
    this.name = "ToolValidationError";
  }
}

/** Agent type is unknown or invalid. */
class UnknownAgentError extends SwarmError {
  constructor(agentType) {
    super(`Unknown agent type: ${agentType}`, "UNKNOWN_AGENT", { agentType });
    this.name = "UnknownAgentError";
  }
}

/** Agent pool is at capacity. */
class AgentPoolFullError extends SwarmError {
  constructor(maxAgents, requestedType) {
    super(
      `Agent pool full (${maxAgents}). Cannot spawn ${requestedType}.`,
      "AGENT_POOL_FULL",
      { maxAgents, requestedType },
    );
    this.name = "AgentPoolFullError";
  }
}

/** LLM call failed after retries. */
class LLMCallError extends SwarmError {
  constructor(message, context = {}) {
    super(message, "LLM_CALL_FAILED", context);
    this.name = "LLMCallError";
  }
}

/** Tool-use loop exceeded limits. */
class ToolLoopError extends SwarmError {
  constructor(message, context = {}) {
    super(message, "TOOL_LOOP_EXCEEDED", context);
    this.name = "ToolLoopError";
  }
}

/** Budget exceeded for GPU or LLM costs. */
class BudgetExceededError extends SwarmError {
  constructor(spent, cap, resource = "gpu") {
    super(
      `Budget exceeded: $${spent.toFixed(2)} of $${cap.toFixed(2)} ${resource} budget used`,
      "BUDGET_EXCEEDED",
      { spent, cap, resource },
    );
    this.name = "BudgetExceededError";
  }
}

module.exports = {
  SwarmError,
  PermissionDeniedError,
  PathTraversalError,
  CommandNotAllowedError,
  SecretDetectedError,
  ToolValidationError,
  UnknownAgentError,
  AgentPoolFullError,
  LLMCallError,
  ToolLoopError,
  BudgetExceededError,
};
