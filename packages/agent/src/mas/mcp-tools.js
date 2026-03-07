/**
 * CodIn MAS — MCP Tool Surface
 *
 * 11 tools exposed as MCP-callable tools for the swarm system.
 * Each tool follows the MCP tool schema: name, description, inputSchema, handler.
 *
 * Tools:
 *   1. swarm_init          — Initialize the swarm
 *   2. swarm_status        — Get swarm status
 *   3. swarm_shutdown      — Shutdown the swarm
 *   4. agent_spawn         — Spawn a specialist agent
 *   5. agent_list          — List active agents
 *   6. agent_metrics       — Get agent metrics
 *   7. task_orchestrate    — Submit a task for orchestration
 *   8. task_status         — Check task status
 *   9. task_results        — Get task results
 *  10. task_cancel         — Cancel a task
 *  11. memory_usage        — Get memory tier usage
 */
"use strict";

const { AGENT_TYPE, TOPOLOGY } = require("./types");

/**
 * Register all MAS MCP tools.
 * @param {object} swarmManager — SwarmManager instance
 * @returns {object[]} Array of MCP tool definitions
 */
function createSwarmMcpTools(swarmManager) {
  return [
    // 1. swarm_init
    {
      name: "swarm_init",
      description:
        "Initialize the Multi-Agent Swarm with optional configuration (topology, strategy, maxAgents, GPU guardrails).",
      inputSchema: {
        type: "object",
        properties: {
          topology: {
            type: "string",
            enum: Object.values(TOPOLOGY),
            description: "Swarm topology",
          },
          maxAgents: {
            type: "number",
            minimum: 1,
            maximum: 20,
            description: "Max concurrent agents",
          },
          concurrency: {
            type: "number",
            minimum: 1,
            maximum: 10,
            description: "Max parallel node execution",
          },
          longTermMemory: {
            type: "boolean",
            description: "Enable long-term memory persistence",
          },
          gpuBudget: { type: "number", description: "GPU spend budget in USD" },
        },
      },
      handler: async (params) => {
        try {
          const result = swarmManager.swarmInit({
            topology: params.topology,
            maxAgents: params.maxAgents,
            concurrency: params.concurrency,
            longTermMemory: params.longTermMemory,
            gpuGuardrails: params.gpuBudget
              ? { budget: params.gpuBudget }
              : undefined,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 2. swarm_status
    {
      name: "swarm_status",
      description:
        "Get the current swarm status including state, agents, tasks, memory, and GPU usage.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        try {
          const status = swarmManager.swarmStatus();
          return {
            content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 3. swarm_shutdown
    {
      name: "swarm_shutdown",
      description:
        "Gracefully shutdown the swarm, cancelling pending tasks and releasing agents.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        try {
          const result = swarmManager.swarmShutdown();
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 4. agent_spawn
    {
      name: "agent_spawn",
      description: "Spawn a specialist agent of the given type.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: Object.values(AGENT_TYPE),
            description: "Agent type to spawn",
          },
        },
        required: ["type"],
      },
      handler: async (params) => {
        try {
          const descriptor = swarmManager.agentSpawn(params.type);
          return {
            content: [
              { type: "text", text: JSON.stringify(descriptor, null, 2) },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 5. agent_list
    {
      name: "agent_list",
      description: "List all active agents with their status and type.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Filter by agent type" },
          status: { type: "string", description: "Filter by agent status" },
        },
      },
      handler: async (params) => {
        try {
          const agents = swarmManager.agentList(params);
          return {
            content: [{ type: "text", text: JSON.stringify(agents, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 6. agent_metrics
    {
      name: "agent_metrics",
      description:
        "Get performance metrics for a specific agent or all agents.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: {
            type: "string",
            description: "Specific agent ID (omit for all agents)",
          },
        },
      },
      handler: async (params) => {
        try {
          const metrics = swarmManager.agentMetrics(params.agentId);
          return {
            content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 7. task_orchestrate
    {
      name: "task_orchestrate",
      description:
        "Submit a goal for multi-agent orchestration. The planner decomposes it, agents execute, and results are merged.",
      inputSchema: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The task goal to accomplish" },
          mode: {
            type: "string",
            enum: ["single", "multi", "iterative"],
            description: "Execution mode",
          },
          topology: {
            type: "string",
            enum: Object.values(TOPOLOGY),
            description: "Override topology",
          },
          acceptanceCriteria: {
            type: "string",
            description: "What success looks like",
          },
        },
        required: ["goal"],
      },
      handler: async (params) => {
        try {
          const result = await swarmManager.taskOrchestrate({
            goal: params.goal,
            mode: params.mode,
            topology: params.topology,
            acceptanceCriteria: params.acceptanceCriteria,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 8. task_status
    {
      name: "task_status",
      description: "Get the status of a specific task including node statuses.",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
        },
        required: ["taskId"],
      },
      handler: async (params) => {
        try {
          const status = swarmManager.taskStatus(params.taskId);
          if (!status)
            return {
              content: [{ type: "text", text: "Task not found" }],
              isError: true,
            };
          return {
            content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 9. task_results
    {
      name: "task_results",
      description:
        "Get the completed results of a task, including outputs and artifacts.",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
        },
        required: ["taskId"],
      },
      handler: async (params) => {
        try {
          const results = swarmManager.taskResults(params.taskId);
          if (!results)
            return {
              content: [{ type: "text", text: "Task not found" }],
              isError: true,
            };
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 10. task_cancel
    {
      name: "task_cancel",
      description: "Cancel a running task and all its queued/running nodes.",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID to cancel" },
        },
        required: ["taskId"],
      },
      handler: async (params) => {
        try {
          const result = swarmManager.taskCancel(params.taskId);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },

    // 11. memory_usage
    {
      name: "memory_usage",
      description:
        "Get memory usage across all three tiers (short-term, working, long-term).",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        try {
          const usage = swarmManager.memoryUsage();
          return {
            content: [{ type: "text", text: JSON.stringify(usage, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    },
  ];
}

module.exports = { createSwarmMcpTools };
