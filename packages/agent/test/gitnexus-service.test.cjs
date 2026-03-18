/**
 * Tests for GitNexus integration service.
 *
 * Tests the service wrapper logic WITHOUT requiring GitNexus to be installed.
 * All external commands are verified through interface contracts, not actual execution.
 */
"use strict";

const { describe, it, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

// Import the service class directly
const { GitNexusService, GITNEXUS_SERVER_NAME } = require("../src/gitnexus/service.js");

describe("GitNexusService", () => {
  let service;
  let mockLogger;
  let mockMcpManager;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    mockMcpManager = {
      loadServersConfig: () => ({
        servers: {},
        globalSettings: { autoConnect: false, requirePermission: true },
      }),
      saveServersConfig: () => {},
      addServer: async () => ({ success: true }),
      servers: new Map(),
    };

    // Create fresh instance for each test (bypass singleton)
    service = new GitNexusService({
      logger: mockLogger,
      mcpClientManager: mockMcpManager,
    });
  });

  describe("constructor", () => {
    it("initializes with default state", () => {
      assert.equal(service._installedVersion, null);
      assert.equal(service._installChecked, false);
    });

    it("accepts null mcpClientManager", () => {
      const svc = new GitNexusService({ logger: mockLogger });
      assert.equal(svc._mcpClientManager, null);
    });
  });

  describe("getMcpStatus", () => {
    it("returns not registered when server not in config", () => {
      const status = service.getMcpStatus();
      assert.equal(status.registered, false);
      assert.equal(status.connected, false);
    });

    it("returns registered when server in config", () => {
      mockMcpManager.loadServersConfig = () => ({
        servers: { [GITNEXUS_SERVER_NAME]: { enabled: true } },
      });
      const status = service.getMcpStatus();
      assert.equal(status.registered, true);
      assert.equal(status.connected, false);
    });

    it("returns connected when server is active", () => {
      mockMcpManager.loadServersConfig = () => ({
        servers: { [GITNEXUS_SERVER_NAME]: { enabled: true } },
      });
      mockMcpManager.servers.set(GITNEXUS_SERVER_NAME, { status: "connected" });
      const status = service.getMcpStatus();
      assert.equal(status.registered, true);
      assert.equal(status.connected, true);
    });

    it("handles null mcpClientManager gracefully", () => {
      service._mcpClientManager = null;
      const status = service.getMcpStatus();
      assert.equal(status.registered, false);
      assert.equal(status.connected, false);
    });

    it("handles config read errors gracefully", () => {
      mockMcpManager.loadServersConfig = () => {
        throw new Error("File corrupted");
      };
      const status = service.getMcpStatus();
      assert.equal(status.registered, false);
      assert.equal(status.connected, false);
    });
  });

  describe("registerMcpServer", () => {
    it("returns error when mcpClientManager is null", async () => {
      service._mcpClientManager = null;
      const result = await service.registerMcpServer();
      assert.equal(result.registered, false);
      assert.ok(result.error);
    });

    it("returns alreadyRegistered when server exists", async () => {
      mockMcpManager.loadServersConfig = () => ({
        servers: { [GITNEXUS_SERVER_NAME]: { enabled: true } },
      });
      const result = await service.registerMcpServer();
      assert.equal(result.registered, true);
      assert.equal(result.alreadyRegistered, true);
    });

    it("calls addServer for new registration", async () => {
      let addedName = null;
      mockMcpManager.addServer = async (name, config) => {
        addedName = name;
        return { success: true };
      };

      const result = await service.registerMcpServer();
      assert.equal(result.registered, true);
      assert.equal(addedName, GITNEXUS_SERVER_NAME);
    });

    it("handles addServer failure", async () => {
      mockMcpManager.addServer = async () => {
        throw new Error("Disk full");
      };

      const result = await service.registerMcpServer();
      assert.equal(result.registered, false);
      assert.match(result.error, /Disk full/);
    });
  });

  describe("checkIndex", () => {
    it("returns not indexed for non-existent repo", async () => {
      const result = await service.checkIndex("/tmp/nonexistent-repo-" + Date.now());
      assert.equal(result.indexed, false);
      assert.equal(result.stale, false);
      assert.equal(result.commitsBehind, 0);
    });
  });

  describe("getStatus", () => {
    it("returns composite status object", async () => {
      const status = await service.getStatus("/tmp/nonexistent-" + Date.now());
      assert.equal(typeof status.installed, "boolean");
      assert.equal(typeof status.indexed, "boolean");
      assert.equal(typeof status.stale, "boolean");
      assert.equal(typeof status.commitsBehind, "number");
      assert.equal(typeof status.mcpRegistered, "boolean");
      assert.equal(typeof status.mcpConnected, "boolean");
      assert.equal(typeof status.needsReindex, "boolean");
    });
  });

  describe("GITNEXUS_SERVER_NAME", () => {
    it("is 'gitnexus'", () => {
      assert.equal(GITNEXUS_SERVER_NAME, "gitnexus");
    });
  });

  describe("EventEmitter", () => {
    it("service is an EventEmitter", () => {
      assert.equal(typeof service.on, "function");
      assert.equal(typeof service.emit, "function");
    });

    it("emits indexed event", (_, done) => {
      service.on("indexed", (data) => {
        assert.ok(data.repoPath);
        assert.ok(data.duration >= 0);
        done();
      });
      service.emit("indexed", { repoPath: "/test", duration: 100 });
    });
  });
});

describe("GitNexus routes module", () => {
  it("exports registerGitNexusRoutes function", () => {
    const { registerGitNexusRoutes } = require("../src/routes/gitnexus.js");
    assert.equal(typeof registerGitNexusRoutes, "function");
  });
});
