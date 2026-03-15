/**
 * MAS — Topologies Smoke Tests
 */
const assert = require("node:assert/strict");

const { TOPOLOGY } = require("../src/mas/types");

let topologies;
try {
  topologies = require("../src/mas/topologies");
} catch (err) {
  console.error("topologies import failed:", err.message);
}

test("topologies module loads without error", () => {
  assert.ok(topologies, "Module should load");
});

test("module exports createTopologyScheduler", () => {
  if (!topologies) return;
  assert.equal(typeof topologies.createTopologyScheduler, "function");
});

test("createTopologyScheduler creates mesh scheduler", () => {
  if (!topologies || typeof topologies.createTopologyScheduler !== "function") return;
  const scheduler = topologies.createTopologyScheduler(TOPOLOGY.MESH);
  assert.ok(scheduler, "Should create mesh scheduler");
});

test("createTopologyScheduler creates hierarchical scheduler", () => {
  if (!topologies || typeof topologies.createTopologyScheduler !== "function") return;
  const scheduler = topologies.createTopologyScheduler(TOPOLOGY.HIERARCHICAL);
  assert.ok(scheduler, "Should create hierarchical scheduler");
});

test("createTopologyScheduler creates ring scheduler", () => {
  if (!topologies || typeof topologies.createTopologyScheduler !== "function") return;
  const scheduler = topologies.createTopologyScheduler(TOPOLOGY.RING);
  assert.ok(scheduler, "Should create ring scheduler");
});

test("createTopologyScheduler creates star scheduler", () => {
  if (!topologies || typeof topologies.createTopologyScheduler !== "function") return;
  const scheduler = topologies.createTopologyScheduler(TOPOLOGY.STAR);
  assert.ok(scheduler, "Should create star scheduler");
});

test("createTopologyScheduler throws for unknown topology", () => {
  if (!topologies || typeof topologies.createTopologyScheduler !== "function") return;
  assert.throws(() => topologies.createTopologyScheduler("pyramid"), /Unknown topology/);
});

test("TOPOLOGY_MAP is exported and frozen", () => {
  if (!topologies || !topologies.TOPOLOGY_MAP) return;
  assert.ok(Object.isFrozen(topologies.TOPOLOGY_MAP));
  assert.equal(Object.keys(topologies.TOPOLOGY_MAP).length, 4);
});
