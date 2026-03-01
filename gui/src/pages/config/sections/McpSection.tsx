import { useContext, useEffect, useState } from "react";
import { Card, EmptyState } from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { ConfigHeader } from "../components/ConfigHeader";

type McpServer = { name: string; status: string; tools: number };

type McpTool = { name: string; description?: string; server?: string };

export function McpSection() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);

  useEffect(() => {
    ideMessenger.request("mcp/list", undefined).then((response) => {
      if (response.status === "success") {
        setServers(response.content.servers);
        setTools(response.content.tools);
      }
    });
  }, [ideMessenger]);

  return (
    <div>
      <ConfigHeader
        title="MCP"
        subtext="Monitor Model Context Protocol servers and tools."
      />
      <Card>
        <div className="flex flex-col gap-4">
          {servers.length === 0 && tools.length === 0 ? (
            <EmptyState
              title="No MCP servers configured"
              description="Add MCP servers to expose tools and resources."
            />
          ) : (
            <>
              {servers.length > 0 && (
                <div className="rounded border border-gray-700 p-2 text-xs">
                  {servers.map((server) => (
                    <div key={server.name} className="flex gap-2">
                      <span className="text-gray-400">{server.status}</span>
                      <span>{server.name}</span>
                      <span className="text-gray-500">
                        ({server.tools} tools)
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {tools.length > 0 && (
                <div className="rounded border border-gray-700 p-2 text-xs">
                  {tools.map((tool) => (
                    <div key={`${tool.server || "local"}-${tool.name}`}>
                      <div className="flex gap-2">
                        <span className="text-gray-400">
                          {tool.server || "local"}
                        </span>
                        <span>{tool.name}</span>
                      </div>
                      {tool.description && (
                        <div className="text-gray-500">{tool.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
