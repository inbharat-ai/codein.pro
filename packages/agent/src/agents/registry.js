/**
 * Agent Registry & Validation Module
 *
 * Evaluates agent configurations, validates capabilities, and ensures
 * permission model alignment. Step 3 of production hardening.
 */

export class AgentRegistry {
  constructor(options = {}) {
    this.agents = new Map();
    this.capabilities = new Map();
    this.permissionModel = options.permissionModel || null;
    this.auditLog = [];
  }

  /**
   * Register an agent with validation
   */
  registerAgent(agentConfig) {
    const validation = this.validateAgentConfig(agentConfig);

    if (!validation.valid) {
      throw new Error(
        `Invalid agent configuration: ${validation.errors.join(", ")}`,
      );
    }

    const agentId = agentConfig.id;

    // Store agent
    this.agents.set(agentId, {
      ...agentConfig,
      registered: new Date().toISOString(),
      verified: false,
      lastHealthCheck: null,
      status: "registered",
    });

    // Register capabilities
    for (const capability of agentConfig.capabilities || []) {
      this.registerCapability(agentId, capability);
    }

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: "agent_registered",
      agentId,
      details: {
        name: agentConfig.name,
        capabilities: (agentConfig.capabilities || []).length,
      },
    });

    return { success: true, agentId };
  }

  /**
   * Validate agent configuration
   */
  validateAgentConfig(config) {
    const errors = [];

    if (!config.id || typeof config.id !== "string") {
      errors.push("Agent ID is required and must be a string");
    }

    if (!config.name || typeof config.name !== "string") {
      errors.push("Agent name is required and must be a string");
    }

    if (!config.version || typeof config.version !== "string") {
      errors.push("Agent version is required and must be a string");
    }

    if (!Array.isArray(config.capabilities)) {
      errors.push("Agent capabilities must be an array");
    } else {
      for (const cap of config.capabilities) {
        if (!cap.name || !cap.description) {
          errors.push("Each capability must have name and description");
          break;
        }
        if (
          cap.requiredPermissions &&
          !Array.isArray(cap.requiredPermissions)
        ) {
          errors.push("Capability requiredPermissions must be an array");
          break;
        }
      }
    }

    if (
      config.requiredPermissions &&
      !Array.isArray(config.requiredPermissions)
    ) {
      errors.push("Agent requiredPermissions must be an array");
    }

    // Validate against permission model if available
    if (this.permissionModel && !this.validatePermissions(config)) {
      errors.push("Agent permissions not aligned with permission model");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Register a capability
   */
  registerCapability(agentId, capability) {
    const key = `${agentId}:${capability.name}`;

    this.capabilities.set(key, {
      agentId,
      ...capability,
      registered: new Date().toISOString(),
      usage: 0,
      lastUsed: null,
    });
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return null;
    }

    return {
      ...agent,
      capabilities: this.getCapabilities(agentId),
    };
  }

  /**
   * Get all capabilities for an agent
   */
  getCapabilities(agentId) {
    const capabilities = [];

    for (const [key, cap] of this.capabilities) {
      if (cap.agentId === agentId) {
        capabilities.push({
          name: cap.name,
          description: cap.description,
          requiredPermissions: cap.requiredPermissions || [],
          usage: cap.usage,
          lastUsed: cap.lastUsed,
        });
      }
    }

    return capabilities;
  }

  /**
   * Audit capability claims
   */
  auditCapabilityClaims(agentId) {
    const agent = this.agents.get(agentId);

    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    const audit = {
      agentId,
      name: agent.name,
      version: agent.version,
      registeredCapabilities: agent.capabilities || [],
      actualCapabilities: this.getCapabilities(agentId),
      mismatch: [],
      verification: {
        allClaimsValid: true,
        permissionsAligned: true,
        lastAudited: new Date().toISOString(),
      },
    };

    // Check for mismatches
    const registered = (agent.capabilities || []).map((c) => c.name);
    const actual = audit.actualCapabilities.map((c) => c.name);

    for (const claimed of registered) {
      if (!actual.includes(claimed)) {
        audit.mismatch.push(`Claimed capability not found: ${claimed}`);
        audit.verification.allClaimsValid = false;
      }
    }

    // Verify permission alignment
    if (this.permissionModel) {
      for (const capability of audit.actualCapabilities) {
        if (!this.verifyCapabilityPermissions(agentId, capability)) {
          audit.verification.permissionsAligned = false;
        }
      }
    }

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: "capability_audit",
      agentId,
      details: audit,
    });

    return audit;
  }

  /**
   * Validate permissions alignment
   */
  validatePermissions(agentConfig) {
    if (!this.permissionModel) return true;

    const requiredPerms = agentConfig.requiredPermissions || [];

    for (const perm of requiredPerms) {
      if (!this.permissionModel.hasPermission(perm)) {
        return false;
      }
    }

    for (const capability of agentConfig.capabilities || []) {
      for (const perm of capability.requiredPermissions || []) {
        if (!this.permissionModel.hasPermission(perm)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Verify capability permissions
   */
  verifyCapabilityPermissions(agentId, capability) {
    if (!this.permissionModel) return true;

    for (const perm of capability.requiredPermissions || []) {
      if (!this.permissionModel.hasPermission(perm)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Mark agent as verified
   */
  markAgentVerified(agentId) {
    const agent = this.agents.get(agentId);

    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    agent.verified = true;
    agent.status = "verified";
    agent.lastVerified = new Date().toISOString();

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: "agent_verified",
      agentId,
      details: { name: agent.name },
    });

    return { success: true, agentId };
  }

  /**
   * Get registry stats
   */
  getStats() {
    let totalCapabilities = 0;
    let verifiedAgents = 0;

    for (const agent of this.agents.values()) {
      totalCapabilities += (agent.capabilities || []).length;
      if (agent.verified) verifiedAgents++;
    }

    return {
      totalAgents: this.agents.size,
      verifiedAgents,
      totalCapabilities,
      auditLogEntries: this.auditLog.length,
    };
  }

  /**
   * Get audit log
   */
  getAuditLog(options = {}) {
    const { limit = 100, action = null } = options;

    let entries = this.auditLog;

    if (action) {
      entries = entries.filter((e) => e.action === action);
    }

    return entries.slice(-limit);
  }
}

export const agentRegistry = new AgentRegistry();

export default { AgentRegistry, agentRegistry };
