/**
 * CodIn MAS — Mesh Topology
 *
 * All agents work in parallel on independent nodes.
 * Synthesis merge at the end combines all results.
 *
 * Best for: exploratory tasks, independent sub-tasks, brainstorming.
 */
"use strict";

const { NODE_STATUS } = require("../types");

class MeshScheduler {
  /**
   * Build a TaskGraph with all nodes independent (no edges) — max parallelism.
   * If nodes already exist, just clear internal dependencies.
   * @param {object} taskGraph
   * @returns {object} Modified taskGraph
   */
  buildGraph(taskGraph) {
    // In mesh: all nodes are independent — remove inter-node dependencies
    for (const node of taskGraph.nodes) {
      node.dependencies = [];
    }
    taskGraph.edges = [];
    return taskGraph;
  }

  /**
   * Get all nodes that are ready to run (queued with no dependencies).
   * In mesh topology, all queued nodes are ready.
   * @param {object} taskGraph
   * @returns {object[]}
   */
  getNextNodes(taskGraph) {
    return taskGraph.nodes.filter((n) => n.status === NODE_STATUS.QUEUED);
  }

  /**
   * Merge results from all completed nodes into a unified output.
   * @param {object} taskGraph
   * @returns {object}
   */
  mergeResults(taskGraph) {
    const completed = taskGraph.nodes.filter(
      (n) => n.status === NODE_STATUS.SUCCEEDED,
    );
    const failed = taskGraph.nodes.filter(
      (n) => n.status === NODE_STATUS.FAILED,
    );

    const results = completed.map((n) => ({
      nodeId: n.id,
      goal: n.goal,
      result: n.result,
      agentType: n.agentType,
    }));

    return {
      strategy: "mesh",
      totalNodes: taskGraph.nodes.length,
      completed: completed.length,
      failed: failed.length,
      results,
      merged: results
        .map((r) => r.result)
        .filter(Boolean)
        .join("\n\n---\n\n"),
    };
  }
}

module.exports = { MeshScheduler };
