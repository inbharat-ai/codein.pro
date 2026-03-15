/**
 * Integration Test — Tool Execution Flow
 *
 * Tests actual tool execution: file read/write, command run,
 * tool chaining, and permission gating.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { BaseAgent } = require("../src/mas/agents/base-agent");
const { AGENT_TYPE, PERMISSION_TYPE } = require("../src/mas/types");
const { MemoryManager } = require("../src/mas/memory");
const { PermissionGate } = require("../src/mas/permissions");

// ─── Helpers ─────────────────────────────────────────────────

let tmpDirs = [];

function createTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codin-tool-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function createTestAgent(runLLMResponses) {
  let callIndex = 0;
  const memory = new MemoryManager({
    workspaceHash: "test_" + Date.now(),
    longTermEnabled: false,
  });
  const permissionGate = new PermissionGate({ memory });

  const agent = new BaseAgent(
    { type: AGENT_TYPE.CODER, constraints: {} },
    {
      permissionGate,
      memory,
      emitEvent: () => {},
      runLLM: async () => {
        const resp = runLLMResponses[callIndex] || '{"answer":"done"}';
        callIndex++;
        return typeof resp === "string" ? resp : JSON.stringify(resp);
      },
    }
  );

  return { agent, memory, permissionGate };
}

// ─── Real Tool Registry ──────────────────────────────────────

function createFileTools(workDir) {
  return {
    read_file: {
      description: "Read a file from disk",
      execute: async (args) => {
        const p = path.resolve(workDir, args.path);
        return fs.readFileSync(p, "utf-8");
      },
    },
    write_file: {
      description: "Write content to a file on disk",
      execute: async (args) => {
        const p = path.resolve(workDir, args.path);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, args.content, "utf-8");
        return `Written ${args.content.length} bytes to ${args.path}`;
      },
    },
    run_command: {
      description: "Execute a shell command",
      execute: async (args) => {
        const { execSync } = require("node:child_process");
        const result = execSync(args.command, {
          encoding: "utf-8",
          timeout: 5000,
          cwd: workDir,
        });
        return result.trim();
      },
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe("Integration — File Read Tool", () => {
  it("reads a temp file and returns its content", async () => {
    const dir = createTmpDir();
    fs.writeFileSync(path.join(dir, "hello.txt"), "Hello World");

    const tools = createFileTools(dir);
    const content = await tools.read_file.execute({ path: "hello.txt" });
    expect(content).toBe("Hello World");
  });

  it("throws when reading non-existent file", async () => {
    const dir = createTmpDir();
    const tools = createFileTools(dir);
    await expect(
      tools.read_file.execute({ path: "nonexistent.txt" })
    ).rejects.toThrow();
  });
});

describe("Integration — File Write Tool", () => {
  it("writes content and verifies on disk", async () => {
    const dir = createTmpDir();
    const tools = createFileTools(dir);

    const result = await tools.write_file.execute({
      path: "output.txt",
      content: "Test output content",
    });

    expect(result).toContain("19 bytes");
    const onDisk = fs.readFileSync(path.join(dir, "output.txt"), "utf-8");
    expect(onDisk).toBe("Test output content");
  });

  it("creates subdirectories as needed", async () => {
    const dir = createTmpDir();
    const tools = createFileTools(dir);

    await tools.write_file.execute({
      path: "sub/deep/file.txt",
      content: "nested",
    });

    expect(
      fs.readFileSync(path.join(dir, "sub/deep/file.txt"), "utf-8")
    ).toBe("nested");
  });
});

describe("Integration — Command Run Tool", () => {
  it("executes echo and gets output", async () => {
    const dir = createTmpDir();
    const tools = createFileTools(dir);
    const result = await tools.run_command.execute({ command: "echo hello" });
    expect(result).toContain("hello");
  });

  it("executes node -e and gets output", async () => {
    const dir = createTmpDir();
    const tools = createFileTools(dir);
    const result = await tools.run_command.execute({
      command: 'node -e "console.log(2+2)"',
    });
    expect(result.trim()).toBe("4");
  });
});

describe("Integration — Tool Chain (write -> read -> verify)", () => {
  it("writes a file, reads it back, and content matches", async () => {
    const dir = createTmpDir();
    const tools = createFileTools(dir);
    const testContent = "chain test: " + Date.now();

    // Write
    await tools.write_file.execute({
      path: "chain.txt",
      content: testContent,
    });

    // Read back
    const readBack = await tools.read_file.execute({ path: "chain.txt" });

    // Verify
    expect(readBack).toBe(testContent);
  });
});

describe("Integration — Agent Tool Loop with Real File Tools", () => {
  it("agent uses tools to write and read a file", async () => {
    const dir = createTmpDir();

    const { agent } = createTestAgent([
      // LLM decides to write a file
      JSON.stringify({
        tool: "write_file",
        args: { path: "test.txt", content: "agent wrote this" },
      }),
      // LLM decides to read it back
      JSON.stringify({
        tool: "read_file",
        args: { path: "test.txt" },
      }),
      // LLM gives final answer
      JSON.stringify({ answer: "File contains: agent wrote this" }),
    ]);

    const tools = createFileTools(dir);
    const result = await agent.callLLMWithTools(
      "Write and verify a file",
      tools,
      { maxIterations: 5, iterationTimeout: 10000, totalTimeout: 30000 }
    );

    expect(result.toolLog).toHaveLength(2);
    expect(result.toolLog[0].tool).toBe("write_file");
    expect(result.toolLog[1].tool).toBe("read_file");
    expect(result.toolLog[1].result).toBe("agent wrote this");
    expect(result.answer).toContain("agent wrote this");
  });
});

describe("Integration — Permission Gate with Tools", () => {
  it("file_read is auto-approved (no user input needed)", async () => {
    const memory = new MemoryManager({
      workspaceHash: "perm_test",
      longTermEnabled: false,
    });
    const gate = new PermissionGate({ memory });

    const result = await gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_READ,
      action: "Read config.json",
    });

    expect(result.decision).toBe("approved");
    expect(result.reason).toContain("Auto-approved");

    // Cleanup
    gate.destroy();
    memory.destroy();
  });

  it("command_run requires approval and blocks without it", async () => {
    const memory = new MemoryManager({
      workspaceHash: "perm_test2",
      longTermEnabled: false,
    });
    const gate = new PermissionGate({ memory });

    // Start the permission request (will block waiting for user response)
    const permPromise = gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.COMMAND_RUN,
      action: "Run: rm -rf /",
    });

    // Verify it's pending
    const pending = gate.getPendingRequests();
    expect(pending).toHaveLength(1);
    expect(pending[0].permissionType).toBe("command_run");

    // Deny it
    gate.respondToRequest(pending[0].id, "deny");

    const result = await permPromise;
    expect(result.decision).toBe("denied");

    // Cleanup
    gate.destroy();
    memory.destroy();
  });

  it("approve_once works once, next request re-blocks", async () => {
    const memory = new MemoryManager({
      workspaceHash: "perm_test3",
      longTermEnabled: false,
    });
    const gate = new PermissionGate({ memory });

    // First request
    const p1 = gate.requestPermission({
      nodeId: "n1",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_WRITE,
      action: "Write to file.txt",
    });
    const pending1 = gate.getPendingRequests();
    gate.respondToRequest(pending1[0].id, "approve_once");
    const r1 = await p1;
    expect(r1.decision).toBe("approved");

    // Second request with same permission type — should block again
    const p2 = gate.requestPermission({
      nodeId: "n2",
      agentId: "a1",
      permissionType: PERMISSION_TYPE.FILE_WRITE,
      action: "Write to another-file.txt",
    });
    const pending2 = gate.getPendingRequests();
    expect(pending2).toHaveLength(1); // Still needs approval

    gate.respondToRequest(pending2[0].id, "deny");
    const r2 = await p2;
    expect(r2.decision).toBe("denied");

    // Cleanup
    gate.destroy();
    memory.destroy();
  });
});
