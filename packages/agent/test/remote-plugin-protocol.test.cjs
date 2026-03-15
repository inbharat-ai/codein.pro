"use strict";
const assert = require("node:assert");

let mod;
try {
  mod = require("../src/mas/remote-plugin-protocol");
} catch (err) {
  console.log("remote-plugin-protocol.js not loadable:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

const {
  PROTOCOL_VERSION,
  MESSAGE_TYPE,
  PLUGIN_CAPABILITY,
  createRegistration,
  createHookDispatch,
  createHookResponse,
  validateMessage,
  RemotePluginHost,
} = mod;

describe("Remote Plugin Protocol — message factories", () => {
  // Test 1: createRegistration creates valid message
  it("createRegistration creates valid message", () => {
    const msg = createRegistration({
      name: "test-plugin",
      version: "2.0.0",
      capabilities: [PLUGIN_CAPABILITY.HOOK_LISTENER],
      hooks: ["task:complete"],
    });
    assert.strictEqual(msg.protocol, PROTOCOL_VERSION);
    assert.strictEqual(msg.type, MESSAGE_TYPE.REGISTER);
    assert.ok(msg.timestamp > 0);
    assert.strictEqual(msg.payload.name, "test-plugin");
    assert.strictEqual(msg.payload.version, "2.0.0");
    assert.deepStrictEqual(msg.payload.capabilities, [PLUGIN_CAPABILITY.HOOK_LISTENER]);
    assert.deepStrictEqual(msg.payload.hooks, ["task:complete"]);
    assert.strictEqual(msg.payload.healthEndpoint, null);
    assert.deepStrictEqual(msg.payload.metadata, {});
  });

  // Test 13: createHookDispatch creates correct message
  it("createHookDispatch creates correct message", () => {
    const msg = createHookDispatch("task:complete", { taskId: "t1" }, "req_123");
    assert.strictEqual(msg.protocol, PROTOCOL_VERSION);
    assert.strictEqual(msg.type, MESSAGE_TYPE.HOOK_DISPATCH);
    assert.strictEqual(msg.requestId, "req_123");
    assert.strictEqual(msg.payload.event, "task:complete");
    assert.deepStrictEqual(msg.payload.data, { taskId: "t1" });
    assert.ok(msg.timestamp > 0);
  });

  // Test 14: createHookResponse creates correct message
  it("createHookResponse creates correct message", () => {
    const msg = createHookResponse("req_456", { success: true, data: { ok: true } });
    assert.strictEqual(msg.protocol, PROTOCOL_VERSION);
    assert.strictEqual(msg.type, MESSAGE_TYPE.HOOK_RESPONSE);
    assert.strictEqual(msg.requestId, "req_456");
    assert.strictEqual(msg.payload.success, true);
    assert.deepStrictEqual(msg.payload.data, { ok: true });
    assert.strictEqual(msg.payload.error, null);
  });

  it("createHookResponse handles failure result", () => {
    const msg = createHookResponse("req_789", { success: false, error: "boom" });
    assert.strictEqual(msg.payload.success, false);
    assert.strictEqual(msg.payload.error, "boom");
  });
});

describe("Remote Plugin Protocol — validateMessage", () => {
  // Test 2: validateMessage accepts valid messages
  it("accepts valid messages", () => {
    const msg = createRegistration({ name: "valid-plugin" });
    const result = validateMessage(msg);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  // Test 3: validateMessage rejects invalid protocol version
  it("rejects invalid protocol version", () => {
    const msg = {
      protocol: 999,
      type: MESSAGE_TYPE.REGISTER,
      timestamp: Date.now(),
    };
    const result = validateMessage(msg);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("protocol version")));
  });

  // Test 4: validateMessage rejects unknown message type
  it("rejects unknown message type", () => {
    const msg = {
      protocol: PROTOCOL_VERSION,
      type: "unknown:type",
      timestamp: Date.now(),
    };
    const result = validateMessage(msg);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Unknown message type")));
  });

  it("rejects non-object input", () => {
    const result = validateMessage(null);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("must be an object")));
  });

  it("rejects missing timestamp", () => {
    const msg = {
      protocol: PROTOCOL_VERSION,
      type: MESSAGE_TYPE.REGISTER,
    };
    const result = validateMessage(msg);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("timestamp")));
  });
});

describe("RemotePluginHost", () => {
  let host;

  beforeEach(() => {
    host = new RemotePluginHost({ maxPlugins: 3 });
  });

  // Test 5: Registers a plugin
  it("registers a plugin", () => {
    const result = host.register(
      { name: "alpha", capabilities: [PLUGIN_CAPABILITY.HOOK_LISTENER], hooks: ["task:start"] },
      { callbackUrl: "http://localhost:9000/hook" },
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.pluginId, "alpha");
  });

  // Test 6: Rejects over max limit
  it("rejects registration over max limit", () => {
    host.register({ name: "p1", capabilities: [], hooks: [] }, {});
    host.register({ name: "p2", capabilities: [], hooks: [] }, {});
    host.register({ name: "p3", capabilities: [], hooks: [] }, {});
    const result = host.register({ name: "p4", capabilities: [], hooks: [] }, {});
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes("Maximum plugin limit"));
  });

  // Test 7: Rejects invalid name
  it("rejects invalid plugin name", () => {
    const r1 = host.register({ name: "", capabilities: [], hooks: [] }, {});
    assert.strictEqual(r1.success, false);
    assert.ok(r1.error.includes("Invalid plugin name"));

    const r2 = host.register({ name: null, capabilities: [], hooks: [] }, {});
    assert.strictEqual(r2.success, false);

    const longName = "x".repeat(101);
    const r3 = host.register({ name: longName, capabilities: [], hooks: [] }, {});
    assert.strictEqual(r3.success, false);
  });

  // Test 8: Unregisters correctly
  it("unregisters a plugin correctly", () => {
    host.register({ name: "toremove", capabilities: [], hooks: ["task:done"] }, {});
    assert.strictEqual(host.listPlugins().length, 1);
    const result = host.unregister("toremove");
    assert.strictEqual(result.success, true);
    assert.strictEqual(host.listPlugins().length, 0);
  });

  // Test 9: Lists registered plugins
  it("lists registered plugins", () => {
    host.register(
      { name: "plugA", capabilities: [PLUGIN_CAPABILITY.TOOL_PROVIDER], hooks: ["h1"] },
      {},
    );
    host.register(
      { name: "plugB", capabilities: [PLUGIN_CAPABILITY.MODEL_PROVIDER], hooks: ["h2"] },
      {},
    );
    const list = host.listPlugins();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].name, "plugA");
    assert.deepStrictEqual(list[0].capabilities, [PLUGIN_CAPABILITY.TOOL_PROVIDER]);
    assert.strictEqual(list[1].name, "plugB");
    assert.ok(list[0].registeredAt > 0);
    assert.ok(list[0].lastHeartbeat > 0);
  });

  // Test 10: Heartbeat updates timestamp
  it("heartbeat updates timestamp", () => {
    host.register({ name: "hb-plugin", capabilities: [], hooks: [] }, {});
    const before = host.listPlugins()[0].lastHeartbeat;
    // Small delay to ensure timestamp difference
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    const updated = host.heartbeat("hb-plugin");
    assert.strictEqual(updated, true);
    const after = host.listPlugins()[0].lastHeartbeat;
    assert.ok(after >= before);
  });

  it("heartbeat returns false for unknown plugin", () => {
    assert.strictEqual(host.heartbeat("nonexistent"), false);
  });

  // Test 11: pruneStale removes old plugins
  it("pruneStale removes old plugins", () => {
    host.register({ name: "stale", capabilities: [], hooks: [] }, {});
    // Manually set lastHeartbeat to the past
    host._plugins.get("stale").lastHeartbeat = Date.now() - 400000;
    const pruned = host.pruneStale(300000);
    assert.strictEqual(pruned, 1);
    assert.strictEqual(host.listPlugins().length, 0);
  });

  it("pruneStale keeps fresh plugins", () => {
    host.register({ name: "fresh", capabilities: [], hooks: [] }, {});
    const pruned = host.pruneStale(300000);
    assert.strictEqual(pruned, 0);
    assert.strictEqual(host.listPlugins().length, 1);
  });

  // Test 12: Hook subscription tracking works
  it("hook subscription tracking works", () => {
    host.register(
      { name: "hookPlugin", capabilities: [], hooks: ["file:save", "task:complete"] },
      {},
    );
    // Check internal subscription map
    assert.ok(host._hookSubscriptions.has("file:save"));
    assert.ok(host._hookSubscriptions.get("file:save").has("hookPlugin"));
    assert.ok(host._hookSubscriptions.has("task:complete"));
    assert.ok(host._hookSubscriptions.get("task:complete").has("hookPlugin"));

    // Unregister cleans up subscriptions
    host.unregister("hookPlugin");
    assert.strictEqual(host._hookSubscriptions.get("file:save").size, 0);
    assert.strictEqual(host._hookSubscriptions.get("task:complete").size, 0);
  });

  // Test 15: Shutdown clears everything
  it("shutdown clears everything", () => {
    host.register({ name: "x1", capabilities: [], hooks: ["h1"] }, {});
    host.register({ name: "x2", capabilities: [], hooks: ["h2"] }, {});
    host.shutdown();
    assert.strictEqual(host.listPlugins().length, 0);
    assert.strictEqual(host._hookSubscriptions.size, 0);
  });

  it("rejects unknown capability", () => {
    const result = host.register(
      { name: "badcap", capabilities: ["totally_fake"], hooks: [] },
      {},
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes("Unknown capability"));
  });

  it("dispatch returns empty array for unsubscribed hooks", async () => {
    const results = await host.dispatch("nobody:listens", { some: "data" });
    assert.deepStrictEqual(results, []);
  });
});
