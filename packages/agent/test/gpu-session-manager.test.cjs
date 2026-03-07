"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { GpuSessionManager } = require("../src/compute/gpu-session-manager");

function createFakeKeyring() {
  const store = new Map();
  return {
    set(key, value) {
      store.set(key, value);
    },
    get(key) {
      return store.get(key) || null;
    },
  };
}

function createFakeProvider() {
  return {
    listGpuTypes: async () => [
      { name: "RTX 4090", vram: 24, costPerHour: 0.8, availability: true },
    ],
    createPod: async () => ({
      podId: "pod_123",
      endpoint: "https://example.runpod.io",
      costPerHour: 0.8,
    }),
    submitJob: async () => ({ jobId: "job_123", status: "submitted" }),
    getJobStatus: async () => ({ status: "completed", result: { ok: true } }),
    getPodLogs: async () => "logs",
    getSessionInfo: () => ({
      podId: "pod_123",
      status: "running",
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      costAccumulated: 1.25,
      budgetRemaining: 8.75,
      ttlMinutes: 30,
      idleShutdownMinutes: 10,
    }),
    stopPod: async () => ({ costFinal: 1.4 }),
    destroy: () => {},
  };
}

test("GpuSessionManager stores and retrieves runpod API key", () => {
  const manager = new GpuSessionManager({ keyring: createFakeKeyring() });
  manager.setApiKey("u1", "rp_test_key");
  assert.equal(manager.getApiKey("u1"), "rp_test_key");
});

test("GpuSessionManager reports disconnected status by default", () => {
  const manager = new GpuSessionManager({ keyring: createFakeKeyring() });
  const status = manager.getStatus("u1");

  assert.equal(status.connected, false);
  assert.equal(status.status, "idle");
  assert.equal(status.jobsRunning, 0);
});

test("GpuSessionManager supports end-to-end provider lifecycle", async () => {
  const manager = new GpuSessionManager({
    keyring: createFakeKeyring(),
    providerFactory: () => createFakeProvider(),
  });

  await manager.connect("u1", { apiKey: "rp_test_key", maxBudgetUsd: 10 });
  const gpus = await manager.listGpuTypes("u1");
  const pod = await manager.createPod("u1", {
    gpuName: "RTX 4090",
    containerImage: "runpod/pytorch:latest",
  });
  const job = await manager.submitJob("u1", {
    input: { prompt: "hello" },
    jobName: "smoke",
  });
  const jobStatus = await manager.getJobStatus("u1", job.jobId);
  const logs = await manager.getLogs("u1");
  const status = manager.getStatus("u1");
  const stopped = await manager.stop("u1");

  assert.equal(gpus.length, 1);
  assert.equal(pod.podId, "pod_123");
  assert.equal(job.jobId, "job_123");
  assert.equal(jobStatus.status, "completed");
  assert.equal(logs, "logs");
  assert.equal(status.connected, true);
  assert.equal(status.provider, "runpod");
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.costFinal, 1.4);
});
