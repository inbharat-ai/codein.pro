"use strict";

const assert = require("node:assert/strict");

const {
  CONTRACTS,
  validateResponse,
  validateRequest,
  getContract,
  listContracts,
} = require("../src/routes/api-contracts");

// ─── Test 1: All contracts are frozen and valid ──────────────────────────

describe("API Contracts - Structure", () => {
  it("CONTRACTS object is frozen", () => {
    assert.ok(Object.isFrozen(CONTRACTS), "CONTRACTS should be frozen");
  });

  it("every contract has a response schema", () => {
    for (const [key, contract] of Object.entries(CONTRACTS)) {
      assert.ok(contract.response, `${key} should have a response schema`);
      assert.equal(typeof contract.response, "object", `${key} response should be an object`);
    }
  });

  it("every contract key has valid HTTP method prefix", () => {
    const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    for (const key of Object.keys(CONTRACTS)) {
      const method = key.split(" ")[0];
      assert.ok(validMethods.includes(method), `${key} has invalid method: ${method}`);
    }
  });

  it("every contract has a description", () => {
    for (const [key, contract] of Object.entries(CONTRACTS)) {
      assert.ok(contract.description, `${key} should have a description`);
      assert.equal(typeof contract.description, "string");
    }
  });

  it("POST contracts with body have at least one field", () => {
    for (const [key, contract] of Object.entries(CONTRACTS)) {
      if (key.startsWith("POST") && contract.request && contract.request.body) {
        const fields = Object.keys(contract.request.body);
        assert.ok(fields.length > 0, `${key} request body should have at least one field`);
      }
    }
  });
});

// ─── Test 2: validateResponse catches missing required fields ──────────────────

describe("API Contracts - validateResponse missing fields", () => {
  it("catches missing required field in swarm status", () => {
    const result = validateResponse("GET /swarm/status", {
      state: "running",
      // missing agents and activeTasks
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("agents")));
    assert.ok(result.errors.some((e) => e.includes("activeTasks")));
  });

  it("catches missing required field in git commit response", () => {
    const result = validateResponse("POST /swarm/git/commit", {
      hash: "abc123",
      // missing message
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("message")));
  });

  it("catches all missing fields in empty response", () => {
    const result = validateResponse("POST /swarm/init", {});
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3, "Should report at least 3 missing fields");
  });
});

// ─── Test 3: validateResponse catches wrong types ──────────────────────────

describe("API Contracts - validateResponse type checking", () => {
  it("catches string where number expected", () => {
    const result = validateResponse("GET /swarm/status", {
      state: "running",
      agents: [],
      activeTasks: "five", // should be number
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("activeTasks") && e.includes("number")));
  });

  it("catches number where string expected", () => {
    const result = validateResponse("POST /swarm/git/branch", {
      branch: 42, // should be string
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("branch") && e.includes("string")));
  });

  it("catches string where array expected", () => {
    const result = validateResponse("GET /swarm/status", {
      state: "running",
      agents: "not-an-array",
      activeTasks: 3,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("agents") && e.includes("array")));
  });

  it("catches array where object expected", () => {
    const result = validateResponse("POST /swarm/init", {
      status: "ok",
      config: [1, 2, 3], // should be object, not array
      warnings: [],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("config") && e.includes("object")));
  });
});

// ─── Test 4: validateResponse passes valid responses ──────────────────────────

describe("API Contracts - validateResponse valid responses", () => {
  it("passes valid swarm status response", () => {
    const result = validateResponse("GET /swarm/status", {
      state: "running",
      agents: [{ id: "a1", type: "coder" }],
      activeTasks: 2,
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("passes valid git commit response", () => {
    const result = validateResponse("POST /swarm/git/commit", {
      hash: "abc123def",
      message: "feat: add type definitions",
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("passes valid swarm init response", () => {
    const result = validateResponse("POST /swarm/init", {
      status: "initialized",
      config: { topology: "mesh", maxAgents: 5 },
      warnings: [],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("passes valid terminal execute response", () => {
    const result = validateResponse("POST /swarm/terminal/sessions/:sessionId/execute", {
      stdout: "hello world\n",
      stderr: "",
      exitCode: 0,
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("allows optional fields to be absent", () => {
    const result = validateResponse("POST /ai-hub/providers/:id/test", {
      success: true,
      latencyMs: 150,
      // modelCount and error are optional
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });
});

// ─── Test 5: getContract returns correct contract ──────────────────────────

describe("API Contracts - getContract", () => {
  it("returns correct contract for GET /swarm/status", () => {
    const contract = getContract("GET", "/swarm/status");
    assert.ok(contract);
    assert.ok(contract.response.state);
    assert.ok(contract.response.agents);
    assert.ok(contract.response.activeTasks);
  });

  it("returns correct contract for POST /swarm/tasks", () => {
    const contract = getContract("POST", "/swarm/tasks");
    assert.ok(contract);
    assert.ok(contract.request.body.goal.required);
    assert.ok(contract.response.taskId);
  });

  it("handles case-insensitive method", () => {
    const contract = getContract("get", "/swarm/status");
    assert.ok(contract);
    assert.ok(contract.response.state);
  });

  it("returns correct contract for git routes", () => {
    const contract = getContract("GET", "/swarm/git/status");
    assert.ok(contract);
    assert.ok(contract.response.branch);
    assert.ok(contract.response.clean);
  });
});

// ─── Test 6: getContract returns null for unknown routes ──────────────────────────

describe("API Contracts - getContract unknown routes", () => {
  it("returns null for unknown path", () => {
    const contract = getContract("GET", "/unknown/route");
    assert.equal(contract, null);
  });

  it("returns null for wrong method on known path", () => {
    const contract = getContract("DELETE", "/swarm/status");
    assert.equal(contract, null);
  });

  it("returns null for empty inputs", () => {
    assert.equal(getContract("", ""), null);
  });
});

// ─── Test 7: listContracts returns all routes ──────────────────────────

describe("API Contracts - listContracts", () => {
  it("returns an array of strings", () => {
    const contracts = listContracts();
    assert.ok(Array.isArray(contracts));
    assert.ok(contracts.length > 0);
    contracts.forEach((c) => assert.equal(typeof c, "string"));
  });

  it("includes all major route categories", () => {
    const contracts = listContracts();
    assert.ok(contracts.some((c) => c.includes("/swarm/")), "Should have swarm routes");
    assert.ok(contracts.some((c) => c.includes("/ai-hub/")), "Should have AI hub routes");
    assert.ok(contracts.some((c) => c.includes("/git/")), "Should have git routes");
    assert.ok(contracts.some((c) => c.includes("/terminal/")), "Should have terminal routes");
  });

  it("count matches CONTRACTS keys", () => {
    const contracts = listContracts();
    assert.equal(contracts.length, Object.keys(CONTRACTS).length);
  });
});

// ─── Test 8: Swarm init response matches contract ──────────────────────────

describe("API Contracts - Swarm init contract", () => {
  it("valid init response passes", () => {
    const result = validateResponse("POST /swarm/init", {
      status: "initialized",
      config: { topology: "mesh", maxAgents: 5, budgetUSD: 1.0, timeoutMs: 60000 },
      warnings: ["No API key configured for openai"],
    });
    assert.equal(result.valid, true);
  });

  it("invalid init response fails with correct errors", () => {
    const result = validateResponse("POST /swarm/init", {
      status: 123, // wrong type
      config: "not-object", // wrong type
      warnings: "not-array", // wrong type
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3);
  });

  it("validates init request body", () => {
    const valid = validateRequest("POST /swarm/init", {
      topology: "mesh",
      maxAgents: 5,
    });
    assert.equal(valid.valid, true);

    const invalid = validateRequest("POST /swarm/init", {
      topology: "invalid-topology",
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some((e) => e.includes("topology")));
  });
});

// ─── Test 9: AI hub providers response matches contract ──────────────────────────

describe("API Contracts - AI Hub providers contract", () => {
  it("valid providers list passes", () => {
    const result = validateResponse("GET /ai-hub/providers", {
      providers: [
        { id: "openai", displayName: "OpenAI", status: "healthy" },
        { id: "anthropic", displayName: "Anthropic", status: "untested" },
      ],
    });
    assert.equal(result.valid, true);
  });

  it("non-array providers fails", () => {
    const result = validateResponse("GET /ai-hub/providers", {
      providers: "openai,anthropic",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("providers") && e.includes("array")));
  });

  it("valid provider key storage response passes", () => {
    const result = validateResponse("POST /ai-hub/providers/:id/key", {
      success: true,
      provider: "openai",
      keyHint: "sk-...abc",
    });
    assert.equal(result.valid, true);
  });

  it("valid provider test response passes with optional fields", () => {
    const result = validateResponse("POST /ai-hub/providers/:id/test", {
      success: false,
      latencyMs: 0,
      error: "Connection refused",
    });
    assert.equal(result.valid, true);
  });
});

// ─── Test 10: Git status response matches contract ──────────────────────────

describe("API Contracts - Git status contract", () => {
  it("valid git status passes", () => {
    const result = validateResponse("GET /swarm/git/status", {
      branch: "main",
      files: [
        { path: "src/index.js", status: "modified", staged: false },
      ],
      ahead: 0,
      behind: 2,
      clean: false,
    });
    assert.equal(result.valid, true);
  });

  it("clean repo status passes", () => {
    const result = validateResponse("GET /swarm/git/status", {
      branch: "main",
      files: [],
      ahead: 0,
      behind: 0,
      clean: true,
    });
    assert.equal(result.valid, true);
  });

  it("missing branch field fails", () => {
    const result = validateResponse("GET /swarm/git/status", {
      files: [],
      ahead: 0,
      behind: 0,
      clean: true,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("branch")));
  });

  it("wrong type for clean field fails", () => {
    const result = validateResponse("GET /swarm/git/status", {
      branch: "main",
      files: [],
      ahead: 0,
      behind: 0,
      clean: "yes", // should be boolean
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("clean") && e.includes("boolean")));
  });
});

// ─── Bonus: validateRequest tests ──────────────────────────

describe("API Contracts - validateRequest", () => {
  it("catches missing required field in task submission", () => {
    const result = validateRequest("POST /swarm/tasks", {
      mode: "single",
      // missing goal (required)
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("goal")));
  });

  it("passes valid task submission", () => {
    const result = validateRequest("POST /swarm/tasks", {
      goal: "Refactor the auth module",
      mode: "auto",
    });
    assert.equal(result.valid, true);
  });

  it("returns valid for unknown contract", () => {
    const result = validateRequest("DELETE /nonexistent", {});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Unknown contract")));
  });

  it("returns valid for contracts without request body schema", () => {
    const result = validateRequest("GET /swarm/status", {});
    assert.equal(result.valid, true);
  });
});
