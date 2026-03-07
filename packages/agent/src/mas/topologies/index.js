/**
 * CodIn MAS — Topology Index
 *
 * Exports all topology schedulers and provides a factory.
 */
"use strict";

const { TOPOLOGY } = require("../types");
const { MeshScheduler } = require("./mesh");
const { HierarchicalScheduler } = require("./hierarchical");
const { RingScheduler } = require("./ring");
const { StarScheduler } = require("./star");

const TOPOLOGY_MAP = Object.freeze({
  [TOPOLOGY.MESH]: MeshScheduler,
  [TOPOLOGY.HIERARCHICAL]: HierarchicalScheduler,
  [TOPOLOGY.RING]: RingScheduler,
  [TOPOLOGY.STAR]: StarScheduler,
});

/**
 * Create a topology scheduler instance.
 * @param {string} topology — TOPOLOGY value
 * @returns {object}
 */
function createTopologyScheduler(topology) {
  const Cls = TOPOLOGY_MAP[topology];
  if (!Cls) {
    throw new Error(`Unknown topology: ${topology}`);
  }
  return new Cls();
}

module.exports = {
  MeshScheduler,
  HierarchicalScheduler,
  RingScheduler,
  StarScheduler,
  TOPOLOGY_MAP,
  createTopologyScheduler,
};
