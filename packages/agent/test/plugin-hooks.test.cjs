/**
 * Tests for PluginHookManager — expanded lifecycle hooks
 */
"use strict";

const assert = require("node:assert");

let PluginHookManager, HOOK_EVENT;
try {
  ({ PluginHookManager, HOOK_EVENT } = require("../src/mas/plugin-hooks"));
} catch (err) {
  console.log("plugin-hooks.js not found — skipping:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

describe("PluginHookManager", () => {
  it("registers and emits hooks", async () => {
    const mgr = new PluginHookManager();
    let called = false;
    mgr.register(HOOK_EVENT.TASK_START, "test-plugin", () => {
      called = true;
    });
    await mgr.emit(HOOK_EVENT.TASK_START, { taskId: "123" });
    assert.ok(called);
  });

  it("runs handlers in priority order", async () => {
    const mgr = new PluginHookManager();
    const order = [];
    mgr.register(HOOK_EVENT.TASK_START, "low", () => order.push("low"), { priority: 200 });
    mgr.register(HOOK_EVENT.TASK_START, "high", () => order.push("high"), { priority: 10 });
    mgr.register(HOOK_EVENT.TASK_START, "mid", () => order.push("mid"), { priority: 100 });

    await mgr.emit(HOOK_EVENT.TASK_START, {});
    assert.deepStrictEqual(order, ["high", "mid", "low"]);
  });

  it("handles async handlers", async () => {
    const mgr = new PluginHookManager();
    let result = null;
    mgr.register(HOOK_EVENT.AGENT_SPAWN, "async-test", async (ctx) => {
      await new Promise((r) => setTimeout(r, 10));
      result = ctx.agentType;
    });
    await mgr.emit(HOOK_EVENT.AGENT_SPAWN, { agentType: "coder" });
    assert.strictEqual(result, "coder");
  });

  it("times out slow handlers", async () => {
    const mgr = new PluginHookManager({ timeout: 50 });
    mgr.register(HOOK_EVENT.NODE_START, "slow", async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const { errors } = await mgr.emit(HOOK_EVENT.NODE_START, {});
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].error.includes("timed out"));
  });

  it("catches sync handler errors", async () => {
    const mgr = new PluginHookManager({ logger: { warn: () => {} } });
    mgr.register(HOOK_EVENT.TASK_FINISH, "bad", () => {
      throw new Error("boom");
    });
    const { errors } = await mgr.emit(HOOK_EVENT.TASK_FINISH, {});
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].error, "boom");
  });

  it("unregisters all hooks for a plugin", async () => {
    const mgr = new PluginHookManager();
    let callCount = 0;
    mgr.register(HOOK_EVENT.TASK_START, "removable", () => callCount++);
    mgr.register(HOOK_EVENT.TASK_FINISH, "removable", () => callCount++);

    mgr.unregister("removable");

    await mgr.emit(HOOK_EVENT.TASK_START, {});
    await mgr.emit(HOOK_EVENT.TASK_FINISH, {});
    assert.strictEqual(callCount, 0);
  });

  it("unregisters a specific hook", async () => {
    const mgr = new PluginHookManager();
    let startCalled = false;
    let finishCalled = false;
    mgr.register(HOOK_EVENT.TASK_START, "partial", () => { startCalled = true; });
    mgr.register(HOOK_EVENT.TASK_FINISH, "partial", () => { finishCalled = true; });

    mgr.unregisterHook(HOOK_EVENT.TASK_START, "partial");

    await mgr.emit(HOOK_EVENT.TASK_START, {});
    await mgr.emit(HOOK_EVENT.TASK_FINISH, {});
    assert.ok(!startCalled);
    assert.ok(finishCalled);
  });

  it("prevents duplicate registrations", async () => {
    const mgr = new PluginHookManager();
    let callCount = 0;
    const handler = () => callCount++;
    mgr.register(HOOK_EVENT.SWARM_INIT, "dupe", handler);
    mgr.register(HOOK_EVENT.SWARM_INIT, "dupe", handler);

    await mgr.emit(HOOK_EVENT.SWARM_INIT, {});
    assert.strictEqual(callCount, 1);
  });

  it("rejects unknown event types", () => {
    const mgr = new PluginHookManager();
    assert.throws(
      () => mgr.register("unknown:event", "test", () => {}),
      /Unknown hook event/,
    );
  });

  it("rejects non-function handlers", () => {
    const mgr = new PluginHookManager();
    assert.throws(
      () => mgr.register(HOOK_EVENT.TASK_START, "test", "not-a-function"),
      /must be a function/,
    );
  });

  it("hasHandlers returns correct boolean", () => {
    const mgr = new PluginHookManager();
    assert.ok(!mgr.hasHandlers(HOOK_EVENT.COST_THRESHOLD));
    mgr.register(HOOK_EVENT.COST_THRESHOLD, "test", () => {});
    assert.ok(mgr.hasHandlers(HOOK_EVENT.COST_THRESHOLD));
  });

  it("listHooks shows registered hooks", () => {
    const mgr = new PluginHookManager();
    mgr.register(HOOK_EVENT.AGENT_SPAWN, "p1", () => {}, { priority: 50 });
    mgr.register(HOOK_EVENT.AGENT_COMPLETE, "p2", () => {});

    const hooks = mgr.listHooks();
    assert.ok(HOOK_EVENT.AGENT_SPAWN in hooks);
    assert.strictEqual(hooks[HOOK_EVENT.AGENT_SPAWN][0].plugin, "p1");
    assert.strictEqual(hooks[HOOK_EVENT.AGENT_SPAWN][0].priority, 50);
  });

  it("clear removes all hooks", async () => {
    const mgr = new PluginHookManager();
    let called = false;
    mgr.register(HOOK_EVENT.SWARM_SHUTDOWN, "test", () => { called = true; });
    mgr.clear();
    await mgr.emit(HOOK_EVENT.SWARM_SHUTDOWN, {});
    assert.ok(!called);
  });

  it("emitPipe chains handler results", async () => {
    const mgr = new PluginHookManager();
    mgr.register(HOOK_EVENT.PERMISSION_REQUEST, "p1", (ctx) => {
      return { score: (ctx.score || 0) + 10 };
    });
    mgr.register(HOOK_EVENT.PERMISSION_REQUEST, "p2", (ctx) => {
      return { score: (ctx.score || 0) + 5 };
    });

    const result = await mgr.emitPipe(HOOK_EVENT.PERMISSION_REQUEST, { score: 0 });
    assert.strictEqual(result.score, 15);
  });

  it("stats returns hook counts", () => {
    const mgr = new PluginHookManager();
    mgr.register(HOOK_EVENT.TASK_START, "a", () => {});
    mgr.register(HOOK_EVENT.TASK_START, "b", () => {});
    mgr.register(HOOK_EVENT.TASK_FINISH, "a", () => {});

    const stats = mgr.stats();
    assert.strictEqual(stats[HOOK_EVENT.TASK_START], 2);
    assert.strictEqual(stats[HOOK_EVENT.TASK_FINISH], 1);
  });

  it("HOOK_EVENT has all expected events", () => {
    const expected = [
      "task:start", "task:finish",
      "agent:spawn", "agent:complete",
      "permission:request", "permission:response",
      "cost:threshold",
      "node:start", "node:finish",
      "memory:write",
      "swarm:init", "swarm:shutdown",
    ];
    for (const evt of expected) {
      assert.ok(
        Object.values(HOOK_EVENT).includes(evt),
        `Missing event: ${evt}`,
      );
    }
  });
});
