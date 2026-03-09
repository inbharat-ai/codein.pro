/**
 * MCP Client Manager
 * Manages connections to MCP servers and tool execution
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { EventEmitter } = require("node:events");

const CODIN_DIR = path.join(os.homedir(), ".codin");
const MCP_DIR = path.join(CODIN_DIR, "mcp");
const SERVERS_CONFIG = path.join(MCP_DIR, "servers.json");
const AUDIT_LOG = path.join(CODIN_DIR, "logs", "mcp_tool_calls.jsonl");

class MCPClientManager extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map(); // name -> { config, process, tools, status }
    this.tools = new Map(); // toolName -> { server, schema }
    this.ensureDirectories();
    this.loadServersConfig();
  }

  ensureDirectories() {
    [MCP_DIR, path.join(CODIN_DIR, "logs")].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Load servers configuration
   */
  loadServersConfig() {
    if (!fs.existsSync(SERVERS_CONFIG)) {
      const defaultConfig = {
        servers: {},
        globalSettings: {
          autoConnect: false,
          requirePermission: true,
        },
      };
      fs.writeFileSync(SERVERS_CONFIG, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    }

    return JSON.parse(fs.readFileSync(SERVERS_CONFIG, "utf8"));
  }

  /**
   * Save servers configuration
   */
  saveServersConfig(config) {
    fs.writeFileSync(SERVERS_CONFIG, JSON.stringify(config, null, 2));
  }

  /**
   * Add MCP server
   */
  async addServer(name, config) {
    const { command, args = [], env = {}, url = null, enabled = true } = config;

    const serverConfig = {
      name,
      command,
      args,
      env,
      url,
      enabled,
      addedAt: new Date().toISOString(),
    };

    // Save to config
    const fullConfig = this.loadServersConfig();
    fullConfig.servers[name] = serverConfig;
    this.saveServersConfig(fullConfig);

    this.emit("server-added", { name, config: serverConfig });

    return { success: true, server: serverConfig };
  }

  /**
   * Remove MCP server
   */
  async removeServer(name) {
    // Disconnect if connected
    if (this.servers.has(name)) {
      await this.disconnect(name);
    }

    // Remove from config
    const fullConfig = this.loadServersConfig();
    delete fullConfig.servers[name];
    this.saveServersConfig(fullConfig);

    this.emit("server-removed", { name });

    return { success: true };
  }

  /**
   * Connect to MCP server
   */
  async connect(name) {
    const config = this.loadServersConfig();
    const serverConfig = config.servers[name];

    if (!serverConfig) {
      throw new Error(`Server not found: ${name}`);
    }

    if (!serverConfig.enabled) {
      throw new Error(`Server disabled: ${name}`);
    }

    if (this.servers.has(name)) {
      return { success: true, message: "Already connected" };
    }

    console.log(`[MCP] Connecting to ${name}...`);

    if (serverConfig.url) {
      // HTTP/WebSocket MCP server
      await this.connectHTTP(name, serverConfig);
    } else {
      // Stdio MCP server
      await this.connectStdio(name, serverConfig);
    }

    this.emit("server-connected", { name });

    return { success: true };
  }

  /**
   * Connect to stdio MCP server
   */
  async connectStdio(name, config) {
    const childProc = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const server = {
      config,
      process: childProc,
      tools: [],
      status: "connected",
      type: "stdio",
    };

    this.servers.set(name, server);

    // Handle process lifecycle
    childProc.on("close", (code) => {
      console.log(`[MCP] Server ${name} exited with code ${code}`);
      this.servers.delete(name);
      this.emit("server-disconnected", { name, code });
    });

    // Initialize MCP protocol
    await this.initializeStdioProtocol(name, server);
  }

  /**
   * Initialize stdio MCP protocol
   */
  async initializeStdioProtocol(name, server) {
    // Send initialize request
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: "CodIn",
          version: "1.0.0",
        },
      },
    };

    server.process.stdin.write(JSON.stringify(initRequest) + "\n");

    // Listen for response
    let buffer = "";

    server.process.stdout.on("data", (data) => {
      buffer += data.toString();

      // Try to parse JSON-RPC messages
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleStdioMessage(name, message);
          } catch (err) {
            console.error(`[MCP] Failed to parse message from ${name}:`, err);
          }
        }
      }
    });

    // List tools
    await this.listToolsStdio(name, server);
  }

  /**
   * Handle stdio message
   */
  handleStdioMessage(name, message) {
    if (message.id !== undefined) {
      // Response to our request
      this.emit(`response-${name}-${message.id}`, message);
    } else if (message.method) {
      // Notification or request from server
      this.emit(`notification-${name}`, message);
    }
  }

  /**
   * List tools from stdio server
   */
  async listToolsStdio(name, server) {
    const request = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    };

    server.process.stdin.write(JSON.stringify(request) + "\n");

    // Wait for response
    const response = await new Promise((resolve) => {
      this.once(`response-${name}-2`, resolve);
      setTimeout(() => resolve({ result: { tools: [] } }), 5000);
    });

    if (response.result && response.result.tools) {
      server.tools = response.result.tools;

      // Register tools
      for (const tool of server.tools) {
        this.tools.set(tool.name, {
          server: name,
          schema: tool,
        });
      }

      console.log(`[MCP] Loaded ${server.tools.length} tools from ${name}`);
    }
  }

  /**
   * Connect to HTTP MCP server (future support)
   */
  async connectHTTP(name, config) {
    // HTTP/WebSocket MCP implementation
    throw new Error("HTTP MCP not yet implemented");
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(name) {
    const server = this.servers.get(name);

    if (!server) {
      return { success: true, message: "Not connected" };
    }

    console.log(`[MCP] Disconnecting from ${name}...`);

    if (server.type === "stdio" && server.process) {
      server.process.kill();
    }

    // Remove tools
    for (const toolName of this.tools.keys()) {
      const tool = this.tools.get(toolName);
      if (tool.server === name) {
        this.tools.delete(toolName);
      }
    }

    this.servers.delete(name);
    this.emit("server-disconnected", { name });

    return { success: true };
  }

  /**
   * List all tools
   */
  listTools(serverName = null) {
    const tools = [];

    for (const [toolName, toolInfo] of this.tools.entries()) {
      if (serverName && toolInfo.server !== serverName) {
        continue;
      }

      tools.push({
        name: toolName,
        server: toolInfo.server,
        description: toolInfo.schema.description,
        inputSchema: toolInfo.schema.inputSchema,
      });
    }

    return tools;
  }

  /**
   * Call MCP tool
   */
  async callTool(toolName, args, context = {}) {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const server = this.servers.get(tool.server);

    if (!server) {
      throw new Error(`Server not connected: ${tool.server}`);
    }

    console.log(`[MCP] Calling tool ${toolName} on ${tool.server}`);

    // Audit log
    this.auditToolCall(toolName, tool.server, args, context);

    // Call tool via stdio
    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    };

    server.process.stdin.write(JSON.stringify(request) + "\n");

    // Wait for response
    const response = await new Promise((resolve, reject) => {
      this.once(`response-${tool.server}-${request.id}`, resolve);
      setTimeout(() => reject(new Error("Tool call timeout")), 60000);
    });

    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    // Audit result
    this.auditToolResult(toolName, response.result);

    return response.result;
  }

  /**
   * Audit tool call
   */
  auditToolCall(toolName, serverName, args, context) {
    const redactedArgs = this.redactSecrets(args);

    const logEntry = {
      timestamp: new Date().toISOString(),
      tool: toolName,
      server: serverName,
      args: redactedArgs,
      context: {
        user: context.user || "unknown",
        session: context.sessionId || null,
      },
    };

    fs.appendFileSync(AUDIT_LOG, JSON.stringify(logEntry) + "\n");
  }

  /**
   * Audit tool result
   */
  auditToolResult(toolName, result) {
    const redactedResult = this.redactSecrets(result);

    const logEntry = {
      timestamp: new Date().toISOString(),
      tool: toolName,
      result: redactedResult,
      type: "result",
    };

    fs.appendFileSync(AUDIT_LOG, JSON.stringify(logEntry) + "\n");
  }

  /**
   * Redact secrets from objects
   */
  redactSecrets(obj) {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    const sensitivePatterns = [
      /key/i,
      /token/i,
      /secret/i,
      /password/i,
      /auth/i,
      /credential/i,
      /api_key/i,
    ];

    const redacted = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const isSensitive = sensitivePatterns.some((pattern) =>
        pattern.test(key),
      );

      if (isSensitive && typeof value === "string") {
        redacted[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        redacted[key] = this.redactSecrets(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Get all servers
   */
  getAllServers() {
    const config = this.loadServersConfig();
    const servers = [];

    for (const [name, serverConfig] of Object.entries(config.servers)) {
      const connected = this.servers.has(name);
      const server = this.servers.get(name);

      servers.push({
        name,
        config: serverConfig,
        status: connected ? "connected" : "disconnected",
        toolsCount: server?.tools.length || 0,
      });
    }

    return servers;
  }

  /**
   * Get tool activity log
   */
  getToolActivity(limit = 100) {
    if (!fs.existsSync(AUDIT_LOG)) {
      return [];
    }

    const lines = fs
      .readFileSync(AUDIT_LOG, "utf8")
      .split("\n")
      .filter(Boolean);
    const entries = lines.slice(-limit).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line, parseError: true };
      }
    });

    return entries.reverse();
  }
}

const mcpClientManager = new MCPClientManager();

// ─── Auto-register built-in MCP servers ────────────────────
(function registerBuiltInServers() {
  const config = mcpClientManager.loadServersConfig();
  if (!config.servers["runpod-gpu"]) {
    const serverPath = path.join(__dirname, "runpod-mcp-server.js");
    if (fs.existsSync(serverPath)) {
      config.servers["runpod-gpu"] = {
        name: "runpod-gpu",
        command: "node",
        args: [serverPath],
        env: {},
        url: null,
        enabled: true,
        builtIn: true,
        description:
          "RunPod GPU-on-demand — provision GPUs and run serverless inference",
        addedAt: new Date().toISOString(),
      };
      mcpClientManager.saveServersConfig(config);
    }
  }
})();

module.exports = { mcpClientManager };
