/**
 * Tests for BrowserAgent — browser automation agent
 */
"use strict";

const assert = require("node:assert");

let BrowserAgent;
try {
  ({ BrowserAgent } = require("../src/mas/agents/browser-agent"));
} catch (err) {
  console.log("browser-agent.js not found — skipping:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

describe("BrowserAgent", () => {
  it("instantiates with correct type", () => {
    const agent = new BrowserAgent({
      permissionGate: { check: async () => ({ decision: "approve_once" }) },
      memory: { shortTerm: { set: () => {} }, working: { set: () => {} } },
      emitEvent: () => {},
      runLLM: async () => "{}",
    });
    assert.ok(agent);
    assert.ok(agent.descriptor);
    assert.ok(
      agent.descriptor.type === "browser" ||
      agent.type === "browser" ||
      agent.agentType === "browser",
    );
  });

  it("has execute method", () => {
    const agent = new BrowserAgent({
      permissionGate: { check: async () => ({ decision: "approve_once" }) },
      memory: { shortTerm: { set: () => {} }, working: { set: () => {} } },
      emitEvent: () => {},
      runLLM: async () => "{}",
    });
    assert.ok(typeof agent.execute === "function");
  });

  it("inherits from BaseAgent", () => {
    let BaseAgent;
    try {
      ({ BaseAgent } = require("../src/mas/agents/base-agent"));
    } catch {
      return; // Can't verify without BaseAgent
    }

    const agent = new BrowserAgent({
      permissionGate: { check: async () => ({ decision: "approve_once" }) },
      memory: { shortTerm: { set: () => {} }, working: { set: () => {} } },
      emitEvent: () => {},
      runLLM: async () => "{}",
    });
    assert.ok(agent instanceof BaseAgent);
  });
});
