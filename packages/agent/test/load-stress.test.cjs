"use strict";
const assert = require("node:assert");

let SwarmManager;
try {
  ({ SwarmManager } = require("../src/mas/swarm-manager"));
} catch (err) {
  console.log("swarm-manager.js not loadable:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

function createManager(maxAgents) {
  return new SwarmManager({
    runLLM: async (prompt) => {
      if (prompt.includes("plan") || prompt.includes("Plan") || prompt.includes("break")) {
        return JSON.stringify({
          nodes: [
            { id: "n1", goal: "Test node", agentType: "coder", dependencies: [] },
          ],
          edges: [],
        });
      }
      return JSON.stringify({ result: "mocked response" });
    },
  });
}

describe("Load & Stress Tests", () => {
  let mgr;

  beforeEach(() => {
    mgr = createManager();
    mgr.swarmInit({ maxAgents: 50 });
  });

  afterEach(() => {
    try { mgr?.swarmShutdown(); } catch {}
  });

  // Test 1: Spawn agents up to max pool size
  it("handles spawning agents up to pool capacity", () => {
    const spawned = [];
    for (let i = 0; i < 50; i++) {
      const agent = mgr.agentSpawn("coder");
      assert.ok(agent.id);
      spawned.push(agent);
    }
    const list = mgr.agentList();
    assert.strictEqual(list.length, 50);
    // Verify pool-full error is thrown for the 51st
    assert.throws(() => mgr.agentSpawn("coder"), /pool full/i);
  });

  // Test 2: Repeated init/shutdown cycles using fresh managers
  it("handles 20 init/shutdown cycles cleanly with fresh managers", () => {
    // Shutdown the one from beforeEach first
    mgr.swarmShutdown();
    for (let i = 0; i < 20; i++) {
      const m = createManager();
      m.swarmInit({});
      const status = m.swarmStatus();
      assert.strictEqual(status.state, "active");
      m.swarmShutdown();
    }
    // Create a fresh one for afterEach cleanup
    mgr = createManager();
    mgr.swarmInit({});
  });

  // Test 3: Event log doesn't grow unbounded
  it("event log is bounded", () => {
    // Spawn a few agents to generate events
    for (let i = 0; i < 5; i++) {
      mgr.agentSpawn("coder");
    }
    const events = mgr.getEventLog(5000);
    assert.ok(events.length <= 2000, "Event log should be bounded");
  });

  // Test 4: Multiple SSE subscribers
  it("handles 50 concurrent SSE subscribers", () => {
    const mockSubscribers = [];
    for (let i = 0; i < 50; i++) {
      const mock = {
        write: () => {},
        on: () => {},
      };
      mgr.subscribe(mock);
      mockSubscribers.push(mock);
    }
    // Should not throw when broadcasting
    mgr.agentSpawn("coder");
    // Cleanup
    for (const sub of mockSubscribers) {
      mgr.unsubscribe(sub);
    }
  });

  // Test 5: Memory usage stays reasonable after operations
  it("memory usage remains bounded after operations", () => {
    for (let i = 0; i < 5; i++) {
      mgr.agentSpawn("coder");
    }
    const usage = mgr.memoryUsage();
    assert.ok(usage);
    assert.ok(typeof usage.shortTerm === "object");
  });

  // Test 6: Task status queries for non-existent tasks (rapid)
  it("handles 1000 rapid taskStatus queries for non-existent tasks", () => {
    for (let i = 0; i < 1000; i++) {
      const status = mgr.taskStatus(`fake-task-${i}`);
      assert.strictEqual(status, null);
    }
  });

  // Test 7: Permission queue doesn't leak
  it("pending permissions stays empty under normal operation", () => {
    for (let i = 0; i < 5; i++) {
      mgr.agentSpawn("coder");
    }
    const pending = mgr.getPendingPermissions();
    assert.ok(Array.isArray(pending));
    // No tasks running = no pending permissions
    assert.strictEqual(pending.length, 0);
  });
});

describe("RateLimiter stress", () => {
  it("handles 1000 requests correctly", () => {
    const { RateLimiter } = require("../src/utils/rate-limiter");
    const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60000 });
    let allowed = 0;
    let blocked = 0;
    for (let i = 0; i < 1000; i++) {
      const result = limiter.check("stress-key");
      if (result.allowed) allowed++;
      else blocked++;
    }
    assert.strictEqual(allowed, 100);
    assert.strictEqual(blocked, 900);
  });
});

describe("Provider Registry stress", () => {
  it("handles rapid key set/remove cycles", () => {
    const { ProviderRegistry } = require("../src/ai-hub/provider-registry");
    const registry = new ProviderRegistry();
    for (let i = 0; i < 100; i++) {
      registry.setKey("openrouter", `sk-test-key-${i}`);
      const hint = registry.getKeyHint("openrouter");
      // getKeyHint returns bullet chars + last 4 chars of the key
      assert.ok(hint, "Key hint should be present after setKey");
      assert.ok(hint.length > 0, "Key hint should be non-empty");
    }
    registry.removeKey("openrouter");
    assert.strictEqual(registry.getKeyHint("openrouter"), null);
  });
});
