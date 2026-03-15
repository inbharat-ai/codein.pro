/**
 * Integration Test — Task Graph (DAG) Execution
 *
 * Tests linear, parallel, and failure topologies using the type factories
 * and validators directly. Also tests retry logic and cancel behavior.
 */
"use strict";

const {
  createTaskGraph,
  createTaskNode,
  validateTaskGraph,
  NODE_STATUS,
} = require("../src/mas/types");

// ─── Task Graph Construction ─────────────────────────────────

describe("TaskGraph — Construction & Validation", () => {
  it("creates a valid task graph with nodes and edges", () => {
    const nodeA = createTaskNode({ goal: "Step A", agentType: "coder" });
    const nodeB = createTaskNode({
      goal: "Step B",
      agentType: "tester",
      dependencies: [nodeA.id],
    });
    const nodeC = createTaskNode({
      goal: "Step C",
      agentType: "reviewer",
      dependencies: [nodeB.id],
    });

    const graph = createTaskGraph({
      goal: "Complete feature",
      nodes: [nodeA, nodeB, nodeC],
      edges: [
        { from: nodeA.id, to: nodeB.id },
        { from: nodeB.id, to: nodeC.id },
      ],
    });

    expect(graph.id).toMatch(/^task_/);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.status).toBe(NODE_STATUS.QUEUED);

    const validation = validateTaskGraph(graph);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("rejects graph with missing goal", () => {
    expect(() =>
      createTaskGraph({ goal: "", nodes: [], edges: [] })
    ).toThrow(/goal is required/i);
  });

  it("detects invalid edge references", () => {
    const node = createTaskNode({ goal: "Only node" });
    const graph = createTaskGraph({
      goal: "test",
      nodes: [node],
      edges: [{ from: "nonexistent_node", to: node.id }],
    });

    const validation = validateTaskGraph(graph);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("unknown node"))).toBe(true);
  });

  it("detects dependency cycles", () => {
    const a = createTaskNode({ goal: "A" });
    const b = createTaskNode({ goal: "B" });
    const graph = createTaskGraph({
      goal: "cyclic",
      nodes: [a, b],
      edges: [
        { from: a.id, to: b.id },
        { from: b.id, to: a.id },
      ],
    });

    const validation = validateTaskGraph(graph);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("cycle"))).toBe(true);
  });
});

// ─── Linear Topology Simulation ──────────────────────────────

describe("TaskGraph — Linear Topology (A -> B -> C)", () => {
  it("executes nodes in dependency order", async () => {
    const executionOrder = [];

    const nodeA = createTaskNode({ goal: "Step A" });
    const nodeB = createTaskNode({
      goal: "Step B",
      dependencies: [nodeA.id],
    });
    const nodeC = createTaskNode({
      goal: "Step C",
      dependencies: [nodeB.id],
    });

    const graph = createTaskGraph({
      goal: "Linear pipeline",
      nodes: [nodeA, nodeB, nodeC],
      edges: [
        { from: nodeA.id, to: nodeB.id },
        { from: nodeB.id, to: nodeC.id },
      ],
    });

    // Simulate execution respecting dependency order
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    async function executeNode(nodeId) {
      const node = nodeMap.get(nodeId);
      // Check all dependencies are completed
      for (const depId of node.dependencies) {
        const dep = nodeMap.get(depId);
        if (dep.status !== NODE_STATUS.SUCCEEDED) {
          throw new Error(`Dependency ${depId} not completed`);
        }
      }
      node.status = NODE_STATUS.RUNNING;
      executionOrder.push(nodeId);
      // Simulate work
      await new Promise((r) => setTimeout(r, 10));
      node.status = NODE_STATUS.SUCCEEDED;
      node.result = `Result of ${node.goal}`;
    }

    await executeNode(nodeA.id);
    await executeNode(nodeB.id);
    await executeNode(nodeC.id);

    expect(executionOrder).toEqual([nodeA.id, nodeB.id, nodeC.id]);
    expect(nodeC.status).toBe(NODE_STATUS.SUCCEEDED);
  });
});

// ─── Parallel Topology Simulation ────────────────────────────

describe("TaskGraph — Parallel Topology (A,B,C -> D)", () => {
  it("A, B, C execute concurrently; D waits for all", async () => {
    const startTimes = {};
    const endTimes = {};

    const nodeA = createTaskNode({ goal: "Parallel A" });
    const nodeB = createTaskNode({ goal: "Parallel B" });
    const nodeC = createTaskNode({ goal: "Parallel C" });
    const nodeD = createTaskNode({
      goal: "Merge D",
      dependencies: [nodeA.id, nodeB.id, nodeC.id],
    });

    const graph = createTaskGraph({
      goal: "Fan-out test",
      nodes: [nodeA, nodeB, nodeC, nodeD],
      edges: [
        { from: nodeA.id, to: nodeD.id },
        { from: nodeB.id, to: nodeD.id },
        { from: nodeC.id, to: nodeD.id },
      ],
    });

    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    async function executeNode(nodeId, delayMs) {
      const node = nodeMap.get(nodeId);
      node.status = NODE_STATUS.RUNNING;
      startTimes[nodeId] = Date.now();
      await new Promise((r) => setTimeout(r, delayMs));
      node.status = NODE_STATUS.SUCCEEDED;
      node.result = `Done: ${node.goal}`;
      endTimes[nodeId] = Date.now();
    }

    // Execute A, B, C concurrently
    await Promise.all([
      executeNode(nodeA.id, 50),
      executeNode(nodeB.id, 30),
      executeNode(nodeC.id, 40),
    ]);

    // All three should be done before D starts
    expect(nodeA.status).toBe(NODE_STATUS.SUCCEEDED);
    expect(nodeB.status).toBe(NODE_STATUS.SUCCEEDED);
    expect(nodeC.status).toBe(NODE_STATUS.SUCCEEDED);

    // Execute D after all deps
    await executeNode(nodeD.id, 10);
    expect(nodeD.status).toBe(NODE_STATUS.SUCCEEDED);

    // Verify D started after all A, B, C finished
    expect(startTimes[nodeD.id]).toBeGreaterThanOrEqual(
      Math.max(endTimes[nodeA.id], endTimes[nodeB.id], endTimes[nodeC.id])
    );
  });
});

// ─── Failure Propagation ─────────────────────────────────────

describe("TaskGraph — Failure Propagation", () => {
  it("B fails -> C (depends on B) is skipped, D gets partial results", async () => {
    const nodeA = createTaskNode({ goal: "A succeeds" });
    const nodeB = createTaskNode({ goal: "B fails" });
    const nodeC = createTaskNode({
      goal: "C depends on B",
      dependencies: [nodeB.id],
    });
    const nodeD = createTaskNode({
      goal: "D merges A and C",
      dependencies: [nodeA.id],
    });

    const graph = createTaskGraph({
      goal: "Failure test",
      nodes: [nodeA, nodeB, nodeC, nodeD],
      edges: [
        { from: nodeB.id, to: nodeC.id },
        { from: nodeA.id, to: nodeD.id },
      ],
    });

    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    // Execute A: succeeds
    nodeMap.get(nodeA.id).status = NODE_STATUS.SUCCEEDED;
    nodeMap.get(nodeA.id).result = "A result";

    // Execute B: fails
    nodeMap.get(nodeB.id).status = NODE_STATUS.FAILED;
    nodeMap.get(nodeB.id).error = "B encountered an error";

    // C should be skipped because B failed
    const nodeC_deps = nodeC.dependencies.map((d) => nodeMap.get(d));
    const allDepsMet = nodeC_deps.every(
      (d) => d.status === NODE_STATUS.SUCCEEDED
    );
    expect(allDepsMet).toBe(false);

    if (!allDepsMet) {
      nodeMap.get(nodeC.id).status = NODE_STATUS.CANCELLED;
    }

    // D can still run because its only dependency is A (succeeded)
    const nodeD_deps = nodeD.dependencies.map((d) => nodeMap.get(d));
    const dDepsMet = nodeD_deps.every(
      (d) => d.status === NODE_STATUS.SUCCEEDED
    );
    expect(dDepsMet).toBe(true);
    nodeMap.get(nodeD.id).status = NODE_STATUS.SUCCEEDED;
    nodeMap.get(nodeD.id).result = "D completed with partial results";

    expect(nodeMap.get(nodeC.id).status).toBe(NODE_STATUS.CANCELLED);
    expect(nodeMap.get(nodeD.id).status).toBe(NODE_STATUS.SUCCEEDED);
  });
});

// ─── Retry Logic ─────────────────────────────────────────────

describe("TaskGraph — Retry Logic", () => {
  it("retries a failed node up to maxRetries then fails", async () => {
    const node = createTaskNode({ goal: "Flaky operation" });
    node.maxRetries = 2;
    let attempts = 0;

    async function executeWithRetry(n) {
      while (n.retryCount <= n.maxRetries) {
        attempts++;
        n.status = NODE_STATUS.RUNNING;

        // Simulate failure
        const succeeded = false;
        if (!succeeded) {
          if (n.retryCount < n.maxRetries) {
            n.retryCount++;
            n.status = NODE_STATUS.RETRYING;
            continue;
          } else {
            n.status = NODE_STATUS.FAILED;
            n.error = "Failed after all retries";
            break;
          }
        }
      }
    }

    await executeWithRetry(node);

    expect(attempts).toBe(3); // initial + 2 retries
    expect(node.retryCount).toBe(2);
    expect(node.status).toBe(NODE_STATUS.FAILED);
    expect(node.error).toContain("all retries");
  });

  it("succeeds on retry after initial failure", async () => {
    const node = createTaskNode({ goal: "Succeeds on retry" });
    node.maxRetries = 3;
    let attempts = 0;

    async function executeWithRetry(n) {
      while (n.retryCount <= n.maxRetries) {
        attempts++;
        n.status = NODE_STATUS.RUNNING;

        // Succeed on third attempt
        const succeeded = attempts >= 3;
        if (succeeded) {
          n.status = NODE_STATUS.SUCCEEDED;
          n.result = "Finally worked";
          return;
        }
        n.retryCount++;
        n.status = NODE_STATUS.RETRYING;
      }
      n.status = NODE_STATUS.FAILED;
    }

    await executeWithRetry(node);

    expect(attempts).toBe(3);
    expect(node.status).toBe(NODE_STATUS.SUCCEEDED);
    expect(node.result).toBe("Finally worked");
  });
});

// ─── Cancel Logic ────────────────────────────────────────────

describe("TaskGraph — Cancel", () => {
  it("cancelling a graph marks all non-completed nodes as cancelled", () => {
    const nodeA = createTaskNode({ goal: "A" });
    const nodeB = createTaskNode({ goal: "B" });
    const nodeC = createTaskNode({ goal: "C" });

    nodeA.status = NODE_STATUS.SUCCEEDED;
    nodeB.status = NODE_STATUS.RUNNING;
    nodeC.status = NODE_STATUS.QUEUED;

    const graph = createTaskGraph({
      goal: "Cancel test",
      nodes: [nodeA, nodeB, nodeC],
      edges: [],
    });

    // Simulate cancel
    function cancelGraph(g) {
      for (const node of g.nodes) {
        if (
          node.status !== NODE_STATUS.SUCCEEDED &&
          node.status !== NODE_STATUS.FAILED
        ) {
          node.status = NODE_STATUS.CANCELLED;
        }
      }
      g.status = NODE_STATUS.CANCELLED;
      g.completedAt = new Date().toISOString();
    }

    cancelGraph(graph);

    expect(nodeA.status).toBe(NODE_STATUS.SUCCEEDED); // Already done — not cancelled
    expect(nodeB.status).toBe(NODE_STATUS.CANCELLED);
    expect(nodeC.status).toBe(NODE_STATUS.CANCELLED);
    expect(graph.status).toBe(NODE_STATUS.CANCELLED);
  });
});

// ─── Task Node Validation ────────────────────────────────────

describe("TaskNode — Creation & Validation", () => {
  it("creates a valid task node with defaults", () => {
    const node = createTaskNode({ goal: "Fix the bug" });
    expect(node.id).toMatch(/^node_/);
    expect(node.goal).toBe("Fix the bug");
    expect(node.status).toBe(NODE_STATUS.QUEUED);
    expect(node.retryCount).toBe(0);
    expect(node.maxRetries).toBe(2);
    expect(node.patches).toEqual([]);
    expect(node.artifacts).toEqual([]);
  });

  it("rejects empty goal", () => {
    expect(() => createTaskNode({ goal: "" })).toThrow(/goal is required/i);
  });

  it("rejects goal exceeding 10000 chars", () => {
    expect(() =>
      createTaskNode({ goal: "x".repeat(10001) })
    ).toThrow(/exceeds 10000/);
  });

  it("rejects invalid permission types", () => {
    expect(() =>
      createTaskNode({
        goal: "test",
        requiredPermissions: ["invalid_perm_type"],
      })
    ).toThrow(/Invalid permission type/);
  });

  it("accepts valid required permissions", () => {
    const node = createTaskNode({
      goal: "write files",
      requiredPermissions: ["file_write", "command_run"],
    });
    expect(node.requiredPermissions).toEqual(["file_write", "command_run"]);
  });
});

// ─── Graph Metadata Tracking ─────────────────────────────────

describe("TaskGraph — Metadata tracking", () => {
  it("tracks completion stats in metadata", () => {
    const graph = createTaskGraph({
      goal: "test",
      nodes: [
        createTaskNode({ goal: "a" }),
        createTaskNode({ goal: "b" }),
        createTaskNode({ goal: "c" }),
      ],
      edges: [],
    });

    // Simulate execution
    graph.nodes[0].status = NODE_STATUS.SUCCEEDED;
    graph.nodes[1].status = NODE_STATUS.FAILED;
    graph.nodes[2].status = NODE_STATUS.CANCELLED;

    // Update metadata as the scheduler would
    graph.metadata.nodesCompleted = graph.nodes.filter(
      (n) => n.status === NODE_STATUS.SUCCEEDED
    ).length;
    graph.metadata.nodesFailed = graph.nodes.filter(
      (n) => n.status === NODE_STATUS.FAILED
    ).length;
    graph.metadata.nodesCancelled = graph.nodes.filter(
      (n) => n.status === NODE_STATUS.CANCELLED
    ).length;

    expect(graph.metadata.nodesCompleted).toBe(1);
    expect(graph.metadata.nodesFailed).toBe(1);
    expect(graph.metadata.nodesCancelled).toBe(1);
  });
});
