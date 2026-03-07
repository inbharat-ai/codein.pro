/**
 * CodIn MAS — Ring Topology
 *
 * Sequential improvement loop: agent1 → agent2 → ... → agentN →
 * check acceptance criteria → repeat (up to maxIterations).
 *
 * Best for: iterative refinement, code → test → review cycles.
 */
"use strict";

const { NODE_STATUS } = require("../types");

const DEFAULT_MAX_ITERATIONS = 3;

class RingScheduler {
  /**
   * Build graph: chain nodes in sequence (each depends on the previous).
   * @param {object} taskGraph
   * @returns {object}
   */
  buildGraph(taskGraph) {
    if (taskGraph.nodes.length <= 1) return taskGraph;

    const edges = [];
    for (let i = 1; i < taskGraph.nodes.length; i++) {
      const prev = taskGraph.nodes[i - 1];
      const curr = taskGraph.nodes[i];
      if (!curr.dependencies.includes(prev.id)) {
        curr.dependencies = [prev.id];
      }
      edges.push({ from: prev.id, to: curr.id });
    }
    taskGraph.edges = edges;

    // Set iteration tracking
    if (!taskGraph.metadata) taskGraph.metadata = {};
    taskGraph.metadata.maxIterations =
      taskGraph.metadata.maxIterations || DEFAULT_MAX_ITERATIONS;
    taskGraph.metadata.currentIteration =
      taskGraph.metadata.currentIteration || 1;

    return taskGraph;
  }

  /**
   * Get next node: only the first queued node whose dependencies are met.
   * This enforces sequential execution.
   * @param {object} taskGraph
   * @returns {object[]}
   */
  getNextNodes(taskGraph) {
    const succeededIds = new Set(
      taskGraph.nodes
        .filter((n) => n.status === NODE_STATUS.SUCCEEDED)
        .map((n) => n.id),
    );

    for (const node of taskGraph.nodes) {
      if (node.status !== NODE_STATUS.QUEUED) continue;
      if (node.dependencies.every((depId) => succeededIds.has(depId))) {
        return [node]; // Only one at a time in ring
      }
    }
    return [];
  }

  /**
   * Check if the ring should iterate again.
   * @param {object} taskGraph
   * @param {function} [acceptanceCheck] — (results) => boolean
   * @returns {{ shouldIterate: boolean, reason: string }}
   */
  checkIteration(taskGraph, acceptanceCheck) {
    const allDone = taskGraph.nodes.every(
      (n) =>
        n.status === NODE_STATUS.SUCCEEDED || n.status === NODE_STATUS.FAILED,
    );
    if (!allDone) {
      return { shouldIterate: false, reason: "Not all nodes completed yet" };
    }

    const maxIter = taskGraph.metadata.maxIterations || DEFAULT_MAX_ITERATIONS;
    const currentIter = taskGraph.metadata.currentIteration || 1;

    if (currentIter >= maxIter) {
      return {
        shouldIterate: false,
        reason: `Max iterations (${maxIter}) reached`,
      };
    }

    // Check acceptance criteria
    if (acceptanceCheck) {
      const results = this.mergeResults(taskGraph);
      const accepted = acceptanceCheck(results);
      if (accepted) {
        return { shouldIterate: false, reason: "Acceptance criteria met" };
      }
    }

    return {
      shouldIterate: true,
      reason: `Iteration ${currentIter}/${maxIter} — criteria not met`,
    };
  }

  /**
   * Reset all nodes to QUEUED for the next iteration.
   * Preserves previous results in node metadata.
   * @param {object} taskGraph
   */
  resetForIteration(taskGraph) {
    taskGraph.metadata.currentIteration =
      (taskGraph.metadata.currentIteration || 1) + 1;
    for (const node of taskGraph.nodes) {
      if (node.result) {
        node.previousIterationResult = node.result;
      }
      node.status = NODE_STATUS.QUEUED;
      node.result = null;
      node.error = null;
    }
  }

  /**
   * Merge results from the final iteration.
   * @param {object} taskGraph
   * @returns {object}
   */
  mergeResults(taskGraph) {
    const lastNode = taskGraph.nodes[taskGraph.nodes.length - 1];
    const completed = taskGraph.nodes.filter(
      (n) => n.status === NODE_STATUS.SUCCEEDED,
    );

    return {
      strategy: "ring",
      iterations: taskGraph.metadata.currentIteration || 1,
      maxIterations: taskGraph.metadata.maxIterations || DEFAULT_MAX_ITERATIONS,
      totalNodes: taskGraph.nodes.length,
      completed: completed.length,
      finalResult: lastNode?.result || null,
      chainResults: taskGraph.nodes.map((n) => ({
        nodeId: n.id,
        goal: n.goal,
        result: n.result,
        agentType: n.agentType,
      })),
    };
  }
}

module.exports = { RingScheduler, DEFAULT_MAX_ITERATIONS };
