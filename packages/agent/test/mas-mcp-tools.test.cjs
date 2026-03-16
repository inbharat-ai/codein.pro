/**
 * MAS — MCP Tools Smoke Tests
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

let mcpTools;
try {
  mcpTools = require("../src/mas/mcp-tools");
} catch (err) {
  console.error("mcp-tools import failed:", err.message);
}

test("mcp-tools module loads without error", () => {
  assert.ok(mcpTools, "Module should load");
});

test("module exports createSwarmMcpTools function", () => {
  if (!mcpTools) return;
  assert.equal(typeof mcpTools.createSwarmMcpTools, "function");
});

test("createSwarmMcpTools returns array of tool definitions", () => {
  if (!mcpTools || typeof mcpTools.createSwarmMcpTools !== "function") return;
  // Provide a minimal mock swarm manager
  const mockManager = {
    init: async () => {},
    getStatus: () => ({}),
    shutdown: async () => {},
    spawnAgent: () => {},
    listAgents: () => [],
    getAgentMetrics: () => ({}),
    orchestrate: async () => {},
    getTaskStatus: () => ({}),
    getTaskResults: () => ({}),
    cancelTask: () => {},
    getMemoryUsage: () => ({}),
  };

  const tools = mcpTools.createSwarmMcpTools(mockManager);
  assert.ok(Array.isArray(tools), "Should return an array");
  assert.ok(tools.length > 0, "Should have at least one tool");

  // Each tool should have name, description, inputSchema, handler
  for (const tool of tools) {
    assert.ok(tool.name, `Tool should have name: ${JSON.stringify(tool)}`);
    assert.ok(tool.description, `Tool ${tool.name} should have description`);
    assert.ok(tool.inputSchema, `Tool ${tool.name} should have inputSchema`);
  }
});

test("MCP tools include expected tool names", () => {
  if (!mcpTools || typeof mcpTools.createSwarmMcpTools !== "function") return;
  const mockManager = {};
  const tools = mcpTools.createSwarmMcpTools(mockManager);
  const names = tools.map((t) => t.name);

  assert.ok(names.includes("swarm_init"), "Should have swarm_init tool");
  assert.ok(names.includes("swarm_status"), "Should have swarm_status tool");
  assert.ok(names.includes("swarm_shutdown"), "Should have swarm_shutdown tool");
});
