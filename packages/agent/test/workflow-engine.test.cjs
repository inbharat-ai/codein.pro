/**
 * WorkflowEngine — Unit Tests
 *
 * Tests template CRUD, instantiation, variable substitution,
 * and execution delegation.
 */
"use strict";

const assert = require("node:assert/strict");
const { WorkflowEngine, extractPlaceholders, replacePlaceholders, deepReplace } = require("../src/mas/workflow-engine");

// ─── Helper: make a mock plan ───────────────────────────────
function makePlan(overrides = {}) {
  return {
    id: "plan-abc123",
    goal: "Build the {{projectName}} feature",
    steps: [
      {
        id: "step_0",
        description: "Create {{fileName}} in {{directory}}",
        agentType: "coder",
        args: { path: "{{directory}}/{{fileName}}", content: "hello" },
        dependsOn: [],
      },
      {
        id: "step_1",
        description: "Write tests for {{fileName}}",
        agentType: "tester",
        args: { target: "{{directory}}/{{fileName}}" },
        dependsOn: ["step_0"],
      },
    ],
    status: "completed",
    category: "development",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("WorkflowEngine", () => {
  describe("extractPlaceholders", () => {
    it("extracts unique placeholder names", () => {
      const result = extractPlaceholders("Hello {{name}}, welcome to {{place}}. {{name}} again.");
      assert.deepEqual(result.sort(), ["name", "place"]);
    });

    it("returns empty array for strings without placeholders", () => {
      assert.deepEqual(extractPlaceholders("no placeholders here"), []);
    });

    it("handles non-string input", () => {
      assert.deepEqual(extractPlaceholders(null), []);
      assert.deepEqual(extractPlaceholders(42), []);
    });
  });

  describe("replacePlaceholders", () => {
    it("replaces matching placeholders", () => {
      const result = replacePlaceholders("Hello {{name}}!", { name: "World" });
      assert.equal(result, "Hello World!");
    });

    it("leaves unmatched placeholders intact", () => {
      const result = replacePlaceholders("{{a}} and {{b}}", { a: "1" });
      assert.equal(result, "1 and {{b}}");
    });

    it("handles non-string input", () => {
      assert.equal(replacePlaceholders(42, {}), 42);
    });
  });

  describe("deepReplace", () => {
    it("recursively replaces in nested objects", () => {
      const input = { a: "{{x}}", b: { c: ["{{y}}", "{{x}}"] } };
      const result = deepReplace(input, { x: "1", y: "2" });
      assert.deepEqual(result, { a: "1", b: { c: ["2", "1"] } });
    });
  });

  describe("saveAsTemplate", () => {
    it("saves a valid template from a plan", () => {
      const engine = new WorkflowEngine();
      const plan = makePlan();
      const tmpl = engine.saveAsTemplate(plan, "my-template", "A test template");

      assert.equal(tmpl.name, "my-template");
      assert.equal(tmpl.description, "A test template");
      assert.equal(tmpl.category, "development");
      assert.equal(tmpl.steps.length, 2);
      assert.ok(tmpl.variables.length >= 2); // at least fileName, directory
      assert.ok(tmpl.createdAt);
    });

    it("rejects empty name", () => {
      const engine = new WorkflowEngine();
      assert.throws(() => engine.saveAsTemplate(makePlan(), ""), /name/i);
    });

    it("rejects invalid name characters", () => {
      const engine = new WorkflowEngine();
      assert.throws(() => engine.saveAsTemplate(makePlan(), "bad<name>"), /name/i);
    });

    it("rejects plan without steps", () => {
      const engine = new WorkflowEngine();
      assert.throws(
        () => engine.saveAsTemplate({ steps: [] }, "empty", ""),
        /at least one step/i,
      );
    });

    it("overwrites existing template with same name", () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "dup", "v1");
      const v2 = engine.saveAsTemplate(makePlan({ category: "ops" }), "dup", "v2");
      assert.equal(v2.description, "v2");
      assert.equal(v2.category, "ops");
    });
  });

  describe("listTemplates", () => {
    it("returns all templates", () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "t1", "");
      engine.saveAsTemplate(makePlan({ category: "ops" }), "t2", "");
      const list = engine.listTemplates();
      assert.equal(list.length, 2);
    });

    it("filters by category", () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "t1", "");
      engine.saveAsTemplate(makePlan({ category: "ops" }), "t2", "");
      const list = engine.listTemplates("ops");
      assert.equal(list.length, 1);
      assert.equal(list[0].name, "t2");
    });
  });

  describe("getTemplate", () => {
    it("returns a saved template", () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "get-me", "");
      const tmpl = engine.getTemplate("get-me");
      assert.ok(tmpl);
      assert.equal(tmpl.name, "get-me");
    });

    it("returns null for non-existent template", () => {
      const engine = new WorkflowEngine();
      assert.equal(engine.getTemplate("nope"), null);
    });
  });

  describe("deleteTemplate", () => {
    it("deletes an existing template", () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "del-me", "");
      const result = engine.deleteTemplate("del-me");
      assert.equal(result.success, true);
      assert.equal(engine.getTemplate("del-me"), null);
    });

    it("returns error for non-existent template", () => {
      const engine = new WorkflowEngine();
      const result = engine.deleteTemplate("nope");
      assert.equal(result.success, false);
      assert.ok(result.error);
    });
  });

  describe("instantiate", () => {
    it("creates a concrete plan with variables replaced", () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "inst-test", "");

      const plan = engine.instantiate("inst-test", {
        projectName: "MyApp",
        fileName: "index.js",
        directory: "src",
      });

      assert.ok(plan.id);
      assert.equal(plan.templateName, "inst-test");
      assert.equal(plan.status, "pending");
      assert.equal(plan.steps.length, 2);
      assert.ok(plan.steps[0].description.includes("index.js"));
      assert.ok(plan.steps[0].description.includes("src"));
      assert.equal(plan.steps[0].args.path, "src/index.js");
    });

    it("throws for missing required variables", () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "missing-vars", "");

      assert.throws(
        () => engine.instantiate("missing-vars", {}),
        /Missing required variables/,
      );
    });

    it("throws for non-existent template", () => {
      const engine = new WorkflowEngine();
      assert.throws(
        () => engine.instantiate("nope", {}),
        /not found/,
      );
    });

    it("increments usageCount", () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "usage", "");

      engine.instantiate("usage", {
        projectName: "A",
        fileName: "f",
        directory: "d",
      });
      engine.instantiate("usage", {
        projectName: "B",
        fileName: "g",
        directory: "e",
      });

      const tmpl = engine.getTemplate("usage");
      assert.equal(tmpl.usageCount, 2);
    });
  });

  describe("runTemplate", () => {
    it("returns error when no execution engine", async () => {
      const engine = new WorkflowEngine();
      engine.saveAsTemplate(makePlan(), "run-no-engine", "");

      const result = await engine.runTemplate("run-no-engine", {
        projectName: "A",
        fileName: "f",
        directory: "d",
      });

      assert.equal(result.status, "error");
      assert.ok(result.error.includes("not available"));
    });

    it("delegates to execution engine with run()", async () => {
      let calledWith = null;
      const mockEngine = {
        run: async (goal, ctx) => {
          calledWith = { goal, ctx };
          return { status: "completed", steps: [] };
        },
      };

      const engine = new WorkflowEngine({ executionEngine: mockEngine });
      engine.saveAsTemplate(makePlan(), "run-engine", "");

      const result = await engine.runTemplate("run-engine", {
        projectName: "A",
        fileName: "f",
        directory: "d",
      });

      assert.equal(result.status, "completed");
      assert.ok(calledWith);
      assert.ok(calledWith.ctx.templatePlan);
    });

    it("delegates to execution engine with taskOrchestrate()", async () => {
      let calledWith = null;
      const mockEngine = {
        taskOrchestrate: async (opts) => {
          calledWith = opts;
          return { status: "completed" };
        },
      };

      const engine = new WorkflowEngine({ executionEngine: mockEngine });
      engine.saveAsTemplate(makePlan(), "run-swarm", "");

      const result = await engine.runTemplate("run-swarm", {
        projectName: "A",
        fileName: "f",
        directory: "d",
      });

      assert.equal(result.status, "completed");
      assert.ok(calledWith);
      assert.ok(calledWith.context.templatePlan);
    });
  });

  describe("persistence integration", () => {
    it("uses persistence store when provided", () => {
      const store = new Map();
      const mockPersistence = {
        get: (k) => store.get(k) || null,
        set: (k, v) => store.set(k, v),
        delete: (k) => store.delete(k),
        keys: () => [...store.keys()],
      };

      const engine = new WorkflowEngine({ persistence: mockPersistence });
      engine.saveAsTemplate(makePlan(), "persist-test", "");

      assert.ok(store.size > 0);
      const tmpl = engine.getTemplate("persist-test");
      assert.ok(tmpl);
      assert.equal(tmpl.name, "persist-test");
    });
  });
});
