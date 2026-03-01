import { useContext, useEffect, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { agentFetch } from "../util/agentConfig";

interface MCPServer {
  name: string;
  status: string;
  toolsCount: number;
  config: any;
}

interface MCPTool {
  name: string;
  server: string;
  description?: string;
  inputSchema?: any;
}

export function MCPToolsPanel() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerCommand, setNewServerCommand] = useState("");

  useEffect(() => {
    loadServers();
    loadTools();
    loadActivity();
  }, []);

  const loadServers = async () => {
    try {
      const response = await agentFetch("/mcp/servers");
      const data = await response.json();
      setServers(data.servers || []);
    } catch (error) {
      console.error("Failed to load MCP servers:", error);
    }
  };

  const loadTools = async (serverName?: string) => {
    try {
      const url = serverName ? `/mcp/tools?server=${serverName}` : "/mcp/tools";
      const response = await agentFetch(url);
      const data = await response.json();
      setTools(data.tools || []);
    } catch (error) {
      console.error("Failed to load tools:", error);
    }
  };

  const loadActivity = async () => {
    try {
      const response = await agentFetch("/mcp/activity?limit=50");
      const data = await response.json();
      setActivity(data.activity || []);
    } catch (error) {
      console.error("Failed to load activity:", error);
    }
  };

  const addServer = async () => {
    if (!newServerName || !newServerCommand) {
      alert("Please enter server name and command");
      return;
    }

    try {
      const parts = newServerCommand.split(" ");
      const command = parts[0];
      const args = parts.slice(1);

      await agentFetch("/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newServerName,
          config: { command, args, enabled: true },
        }),
      });

      setNewServerName("");
      setNewServerCommand("");
      setShowAddServer(false);
      await loadServers();
    } catch (error) {
      console.error("Failed to add server:", error);
      alert("Failed to add server");
    }
  };

  const connectServer = async (name: string) => {
    try {
      await agentFetch(`/mcp/servers/${encodeURIComponent(name)}/connect`, {
        method: "POST",
      });
      await loadServers();
      await loadTools();
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  const disconnectServer = async (name: string) => {
    try {
      await agentFetch(`/mcp/servers/${encodeURIComponent(name)}/disconnect`, {
        method: "POST",
      });
      await loadServers();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  };

  const removeServer = async (name: string) => {
    if (!confirm(`Remove server "${name}"?`)) {
      return;
    }

    try {
      await agentFetch(`/mcp/servers/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      await loadServers();
    } catch (error) {
      console.error("Failed to remove server:", error);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">MCP Tools</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowActivity(!showActivity)}
            className="bg-vsc-input-background rounded px-3 py-1 text-sm"
          >
            {showActivity ? "Hide" : "Show"} Activity
          </button>
          <button
            onClick={() => setShowAddServer(!showAddServer)}
            className="bg-vsc-button text-vsc-button-foreground rounded px-3 py-1 text-sm"
          >
            Add Server
          </button>
        </div>
      </div>

      {/* Add Server Form */}
      {showAddServer && (
        <div className="border-vsc-input-border flex flex-col gap-2 rounded border border-solid p-3">
          <input
            type="text"
            placeholder="Server name"
            value={newServerName}
            onChange={(e) => setNewServerName(e.target.value)}
            className="bg-vsc-input-background rounded px-2 py-1 text-sm"
          />
          <input
            type="text"
            placeholder="Command (e.g., npx @modelcontextprotocol/server-filesystem)"
            value={newServerCommand}
            onChange={(e) => setNewServerCommand(e.target.value)}
            className="bg-vsc-input-background rounded px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={addServer}
              className="bg-vsc-button text-vsc-button-foreground rounded px-3 py-1 text-sm"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddServer(false)}
              className="bg-vsc-input-background rounded px-3 py-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Servers List */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium opacity-70">Servers</h3>
        {servers.length === 0 ? (
          <div className="border-vsc-input-border rounded border border-solid p-3 text-sm opacity-50">
            No MCP servers configured
          </div>
        ) : (
          servers.map((server) => (
            <div
              key={server.name}
              className="border-vsc-input-border flex flex-col gap-2 rounded border border-solid p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{server.name}</div>
                  <div className="text-xs opacity-70">
                    {server.status} • {server.toolsCount} tools
                  </div>
                </div>
                <div className="flex gap-2">
                  {server.status === "connected" ? (
                    <button
                      onClick={() => disconnectServer(server.name)}
                      className="bg-vsc-input-background rounded px-2 py-1 text-xs"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => connectServer(server.name)}
                      className="bg-vsc-button text-vsc-button-foreground rounded px-2 py-1 text-xs"
                    >
                      Connect
                    </button>
                  )}
                  <button
                    onClick={() => removeServer(server.name)}
                    className="bg-vsc-input-background rounded px-2 py-1 text-xs text-red-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tools List */}
      {tools.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium opacity-70">Available Tools</h3>
          {tools.map((tool) => (
            <div
              key={`${tool.server}:${tool.name}`}
              className="border-vsc-input-border rounded border border-solid p-2"
            >
              <div className="text-sm font-medium">{tool.name}</div>
              {tool.description && (
                <div className="text-xs opacity-70">{tool.description}</div>
              )}
              <div className="text-xs opacity-50">Server: {tool.server}</div>
            </div>
          ))}
        </div>
      )}

      {/* Activity Log */}
      {showActivity && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium opacity-70">Recent Activity</h3>
          <div className="border-vsc-input-border flex max-h-64 flex-col gap-1 overflow-y-auto rounded border border-solid p-2">
            {activity.length === 0 ? (
              <div className="text-xs opacity-50">No activity yet</div>
            ) : (
              activity.map((entry, index) => (
                <div
                  key={index}
                  className="border-vsc-input-border border-b border-solid pb-1 text-xs"
                >
                  <div className="font-medium">{entry.tool}</div>
                  <div className="opacity-70">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
