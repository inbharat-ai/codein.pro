/**
 * CodIn MAS — Planner Agent
 *
 * Decomposes high-level goals into task graphs.
 * Uses LLM to break goals into steps, estimate dependencies, and choose topology.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  TOPOLOGY,
  EXECUTION_STRATEGY,
  createTaskNode,
  createTaskGraph,
} = require("../types");

const SYSTEM_PROMPT = `You are the CodIn Planner Agent. Your job is to decompose a coding goal into concrete, actionable task nodes.

RULES:
1. Each node must be a single, well-defined action (e.g., "Create auth middleware", "Write unit tests for UserService")
2. Identify dependencies between nodes — node B depends on node A if B needs A's output
3. Choose the right agent type for each node
4. Estimate required permissions for each node
5. Be thorough but not over-granular — 3-15 nodes per plan

AGENT TYPES: planner, coder, debugger, tester, refactorer, architect, devops, security, docs, reviewer

OUTPUT FORMAT (JSON):
{
  "nodes": [
    {
      "goal": "What this node must accomplish",
      "agentType": "coder",
      "dependencies": [],
      "requiredPermissions": ["file_read", "file_write"],
      "maxRetries": 2
    }
  ],
  "edges": [
    { "from": 0, "to": 1 }
  ],
  "suggestedTopology": "hierarchical",
  "suggestedStrategy": "parallel",
  "acceptanceCriteria": "Description of what success looks like"
}`;

class PlannerAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.PLANNER,
        constraints: {
          network: false,
          write: false,
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
    return "Decomposes goals into task graphs with dependencies, agent assignments, and topology selection.";
  }

  /**
   * Decompose a goal into a TaskGraph.
   * @param {object} node — The planning task node
   * @param {object} context — { goal, mode, topology, acceptanceCriteria }
   * @returns {Promise<object>}
   */
  async execute(node, context) {
    const prompt = `Decompose this goal into a task graph:

GOAL: ${context.goal || node.goal}
MODE: ${context.mode || "single"}
PREFERRED TOPOLOGY: ${context.topology || "hierarchical"}
ACCEPTANCE CRITERIA: ${context.acceptanceCriteria || "All tasks complete without errors"}

Current workspace context:
${context.workspaceSummary || "No workspace context available."}`;

    const plan = await this.callLLMJson(prompt);

    // Build real TaskGraph from LLM output
    const nodes = (plan.nodes || []).map((n, _i) =>
      createTaskNode({
        goal: n.goal,
        agentType: n.agentType || AGENT_TYPE.CODER,
        requiredPermissions: n.requiredPermissions || [],
        maxRetries: n.maxRetries || 2,
      }),
    );

    // Resolve edges (LLM returns index-based)
    const edges = (plan.edges || [])
      .map((e) => ({
        from: nodes[e.from]?.id,
        to: nodes[e.to]?.id,
      }))
      .filter((e) => e.from && e.to);

    // Wire dependencies
    for (const edge of edges) {
      const target = nodes.find((n) => n.id === edge.to);
      if (target && !target.dependencies.includes(edge.from)) {
        target.dependencies.push(edge.from);
      }
    }

    const taskGraph = createTaskGraph({
      goal: context.goal || node.goal,
      mode: context.mode || "single",
      executionStrategy: plan.suggestedStrategy || EXECUTION_STRATEGY.PARALLEL,
      topology:
        plan.suggestedTopology || context.topology || TOPOLOGY.HIERARCHICAL,
      acceptanceCriteria:
        plan.acceptanceCriteria || context.acceptanceCriteria || "",
      nodes,
      edges,
    });

    return {
      result: `Decomposed into ${nodes.length} nodes with ${edges.length} edges`,
      taskGraph,
      confidence: 0.85,
    };
  }
}

module.exports = { PlannerAgent };
