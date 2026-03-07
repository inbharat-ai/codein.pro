/**
 * CodIn MAS — Hierarchical Topology
 *
 * Supervisor (planner) decomposes the task, workers execute sub-tasks,
 * supervisor resolves conflicts and synthesizes final result.
 *
 * Best for: complex multi-step tasks, coordinated work.
 */
"use strict";

const { NODE_STATUS, AGENT_TYPE } = require("../types");

class HierarchicalScheduler {
  /**
   * Build graph: first node is the supervisor (planner),
   * remaining nodes depend on it; a final review node depends on all workers.
   * @param {object} taskGraph
   * @returns {object}
   */
  buildGraph(taskGraph) {
    if (taskGraph.nodes.length === 0) return taskGraph;

    // Ensure first node is the planner/supervisor
    const plannerNode = taskGraph.nodes.find(
      (n) => n.agentType === AGENT_TYPE.PLANNER,
    );
    if (plannerNode && taskGraph.nodes[0].id !== plannerNode.id) {
      // Move planner to front
      taskGraph.nodes = [
        plannerNode,
        ...taskGraph.nodes.filter((n) => n.id !== plannerNode.id),
      ];
    }

    const supervisorId = taskGraph.nodes[0].id;
    const workerNodes = taskGraph.nodes.slice(1);

    // All workers depend on the supervisor
    const edges = [];
    for (const worker of workerNodes) {
      if (!worker.dependencies.includes(supervisorId)) {
        worker.dependencies.push(supervisorId);
      }
      edges.push({ from: supervisorId, to: worker.id });
    }

    taskGraph.edges = edges;
    return taskGraph;
  }

  /**
   * Get ready nodes: nodes whose all dependencies are SUCCEEDED.
   * @param {object} taskGraph
   * @returns {object[]}
   */
  getNextNodes(taskGraph) {
    const succeededIds = new Set(
      taskGraph.nodes
        .filter((n) => n.status === NODE_STATUS.SUCCEEDED)
        .map((n) => n.id),
    );

    return taskGraph.nodes.filter((n) => {
      if (n.status !== NODE_STATUS.QUEUED) return false;
      return n.dependencies.every((depId) => succeededIds.has(depId));
    });
  }

  /**
   * Merge: supervisor synthesizes worker results.
   * @param {object} taskGraph
   * @returns {object}
   */
  mergeResults(taskGraph) {
    const supervisor = taskGraph.nodes[0];
    const workers = taskGraph.nodes.slice(1);
    const completed = workers.filter((n) => n.status === NODE_STATUS.SUCCEEDED);
    const failed = workers.filter((n) => n.status === NODE_STATUS.FAILED);

    return {
      strategy: "hierarchical",
      supervisor: { nodeId: supervisor?.id, status: supervisor?.status },
      totalWorkers: workers.length,
      completed: completed.length,
      failed: failed.length,
      results: completed.map((n) => ({
        nodeId: n.id,
        goal: n.goal,
        result: n.result,
        agentType: n.agentType,
      })),
      merged: completed
        .map((n) => n.result)
        .filter(Boolean)
        .join("\n\n"),
    };
  }
}

module.exports = { HierarchicalScheduler };
