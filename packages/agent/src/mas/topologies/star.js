/**
 * CodIn MAS — Star Topology
 *
 * Broadcast task to all agents, compare outputs, select best by scoring.
 *
 * Best for: competitive solutions, choosing the best approach, conflicting opinions.
 */
"use strict";

const { NODE_STATUS } = require("../types");

class StarScheduler {
  /**
   * Build graph: all nodes are independent (like mesh) — they all tackle the same goal
   * from different perspectives.
   * @param {object} taskGraph
   * @returns {object}
   */
  buildGraph(taskGraph) {
    // Star: all nodes independent, will be compared afterwards
    for (const node of taskGraph.nodes) {
      node.dependencies = [];
    }
    taskGraph.edges = [];
    return taskGraph;
  }

  /**
   * All queued nodes are ready (like mesh — parallel execution).
   * @param {object} taskGraph
   * @returns {object[]}
   */
  getNextNodes(taskGraph) {
    return taskGraph.nodes.filter((n) => n.status === NODE_STATUS.QUEUED);
  }

  /**
   * Score and select the best result.
   * Scoring: confidence × completeness. Breaks ties by agent type preference.
   *
   * @param {object} taskGraph
   * @param {function} [customScorer] — (node) => number
   * @returns {object}
   */
  mergeResults(taskGraph, customScorer) {
    const completed = taskGraph.nodes.filter(
      (n) => n.status === NODE_STATUS.SUCCEEDED,
    );
    const failed = taskGraph.nodes.filter(
      (n) => n.status === NODE_STATUS.FAILED,
    );

    if (completed.length === 0) {
      return {
        strategy: "star",
        totalNodes: taskGraph.nodes.length,
        completed: 0,
        failed: failed.length,
        winner: null,
        scores: [],
        merged: null,
      };
    }

    // Score each completed node
    const scored = completed.map((node) => {
      const score = customScorer
        ? customScorer(node)
        : this._defaultScore(node);
      return { node, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0];

    return {
      strategy: "star",
      totalNodes: taskGraph.nodes.length,
      completed: completed.length,
      failed: failed.length,
      winner: {
        nodeId: winner.node.id,
        goal: winner.node.goal,
        result: winner.node.result,
        agentType: winner.node.agentType,
        score: winner.score,
      },
      scores: scored.map((s) => ({
        nodeId: s.node.id,
        agentType: s.node.agentType,
        score: s.score,
      })),
      merged: winner.node.result,
    };
  }

  /**
   * Default scoring: use confidence from result, plus a small bonus for having artifacts.
   * @param {object} node
   * @returns {number}
   */
  _defaultScore(node) {
    let score = 0.5; // base
    if (node.result && typeof node.result === "object") {
      score = node.result.confidence || 0.5;
      if (node.result.files && node.result.files.length > 0) score += 0.1;
      if (node.result.tests && node.result.tests.length > 0) score += 0.1;
    } else if (node.result && typeof node.result === "string") {
      // Longer results score slightly higher (more thorough)
      score += Math.min(node.result.length / 5000, 0.2);
    }
    return Math.min(score, 1.0);
  }
}

module.exports = { StarScheduler };
