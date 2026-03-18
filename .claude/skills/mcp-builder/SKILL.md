---
name: mcp-builder
display_name: MCP Server Builder
description: Build Model Context Protocol servers — transports, tools, resources, prompts, error handling, testing, deployment, and security
category: ai-infrastructure
version: 1.0.0
author: inbharatai
tags:
  - mcp
  - model-context-protocol
  - tools
  - resources
  - ai
  - claude
---

# MCP Server Builder

Build production-quality MCP (Model Context Protocol) servers that expose tools, resources, and prompts to AI assistants like Claude. Covers transport selection, schema design, error handling, testing, and deployment.

## When to Use

- Building a new MCP server to expose data or actions to Claude
- Adding tools, resources, or prompts to an existing MCP server
- Debugging MCP server connection or protocol issues
- Reviewing MCP server code for correctness and security
- Deploying an MCP server for team or public use

## When NOT to Use

- Building a regular REST API (use api-designer skill)
- Working with Claude's API directly (use claude-api skill)
- Building AI agents that call tools (MCP is the tool provider side)

## MCP Architecture Overview

```
Claude Desktop / Claude Code / AI App
        |
        | (MCP Protocol — JSON-RPC 2.0)
        |
   MCP Server
   ├── Tools      — Actions the AI can invoke (execute code, query DB, send email)
   ├── Resources  — Data the AI can read (files, DB records, API data)
   └── Prompts    — Reusable prompt templates with arguments
```

## Transport Types

### stdio (Recommended for Local Tools)

Communication over stdin/stdout. Simplest transport, used by Claude Desktop and Claude Code.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "my-mcp-server",
  version: "1.0.0",
});

// Register tools, resources, prompts here...

const transport = new StdioServerTransport();
await server.connect(transport);
```

**When to use**: Local development tools, file system access, CLI integrations. The process is spawned by the MCP client.

### SSE (Server-Sent Events)

HTTP-based transport for remote servers. Client connects via HTTP, server pushes events.

```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();

app.get("/sse", (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  server.connect(transport);
});

app.post("/messages", (req, res) => {
  transport.handlePostMessage(req, res);
});
```

**When to use**: Remote servers, web-hosted tools, multi-user deployments.

### Streamable HTTP

Newer transport that uses standard HTTP with streaming responses. Supports both stateful sessions and stateless request/response.

**When to use**: Production APIs where you need HTTP infrastructure (load balancers, auth middleware, CDNs).

## Defining Tools

Tools are actions the AI can invoke. Each tool has a name, description, input schema, and handler.

```typescript
server.tool(
  "execute-query",
  "Execute a read-only SQL query against the analytics database. Returns up to 1000 rows.",
  {
    // Input schema — JSON Schema format
    query: z
      .string()
      .describe("SQL SELECT query to execute. Must be read-only."),
    limit: z
      .number()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Maximum rows to return"),
  },
  async ({ query, limit }) => {
    // Validate: reject non-SELECT queries
    const normalized = query.trim().toUpperCase();
    if (!normalized.startsWith("SELECT")) {
      return {
        content: [
          { type: "text", text: "Error: Only SELECT queries are allowed." },
        ],
        isError: true,
      };
    }

    try {
      const results = await db.query(`${query} LIMIT ${limit}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results.rows, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Query error: ${error.message}` }],
        isError: true,
      };
    }
  },
);
```

### Tool Design Best Practices

- **Descriptive names**: `search-documents`, `create-issue`, `get-user-profile` — not `query`, `do`, `run`
- **Rich descriptions**: Tell the AI WHEN to use the tool, what it returns, and any limitations
- **Strict input validation**: Validate with Zod schemas. Reject bad input with clear error messages.
- **Idempotency**: Where possible, make tools safe to call multiple times with the same input
- **Error handling**: Always return `isError: true` with a human-readable message on failure. Never throw unhandled exceptions.
- **Limit output size**: If a tool can return large data, truncate or paginate. LLMs have context limits.

## Defining Resources

Resources are data sources the AI can read. They have a URI scheme and return structured content.

```typescript
server.resource(
  "config",
  "file:///app/config.json",
  "Application configuration file with current settings",
  async (uri) => {
    const config = await fs.promises.readFile("/app/config.json", "utf8");
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: config,
        },
      ],
    };
  },
);
```

### Dynamic Resource Templates

For resources that match a pattern (e.g., any file in a directory):

```typescript
server.resource(
  "project-file",
  new ResourceTemplate("file:///project/{path}", { list: undefined }),
  "Read a file from the project directory",
  async (uri, { path }) => {
    const safePath = path.resolve("/project", path);
    if (!safePath.startsWith("/project/")) {
      throw new Error("Path traversal detected");
    }
    const content = await fs.promises.readFile(safePath, "utf8");
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: content }],
    };
  },
);
```

## Defining Prompts

Prompts are reusable templates the AI can invoke with arguments:

```typescript
server.prompt(
  "code-review",
  "Generate a code review for the given diff",
  { diff: z.string().describe("The git diff to review") },
  ({ diff }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Review this code diff for bugs, security issues, and style:\n\n${diff}`,
        },
      },
    ],
  }),
);
```

## Error Handling

Use standard MCP error codes:

```typescript
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// For invalid parameters
throw new McpError(ErrorCode.InvalidParams, "Missing required field: query");

// For resources not found
throw new McpError(ErrorCode.InvalidRequest, `File not found: ${path}`);

// For internal failures
throw new McpError(ErrorCode.InternalError, "Database connection failed");
```

Always catch errors in tool handlers and return `isError: true` responses instead of letting exceptions bubble up unhandled.

## Testing

### MCP Inspector

The official testing tool for MCP servers:

```bash
npx @modelcontextprotocol/inspector your-server-command
```

This opens a web UI where you can:

- List and invoke tools with custom inputs
- Browse resources
- Test prompts
- See raw JSON-RPC messages

### Programmatic Testing

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

test("execute-query tool returns results", async () => {
  const server = createMyServer();
  const client = new Client({ name: "test", version: "1.0.0" });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const result = await client.callTool("execute-query", {
    query: "SELECT 1 as test",
    limit: 10,
  });

  expect(result.isError).toBeFalsy();
  expect(JSON.parse(result.content[0].text)).toEqual([{ test: 1 }]);
});
```

## Security

### Input Sanitization

- Validate ALL tool inputs with Zod schemas (types, ranges, patterns)
- For SQL tools: use parameterized queries, whitelist allowed tables, restrict to SELECT
- For file tools: resolve paths and verify they stay within allowed directories
- For shell tools: never pass user input to `exec()`; use `execFile()` with argument arrays

### Rate Limiting

Implement per-tool rate limiting to prevent abuse:

```typescript
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(toolName: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(toolName);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(toolName, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}
```

### Authentication

For remote MCP servers, authenticate connections:

- Use bearer tokens in SSE/HTTP transport headers
- Validate tokens on every request, not just connection
- Implement per-user tool access controls if multi-tenant

## Deployment

### npm Package

```json
{
  "name": "@myorg/mcp-server-analytics",
  "version": "1.0.0",
  "bin": { "mcp-server-analytics": "./dist/index.js" },
  "files": ["dist/"]
}
```

Users install and configure in Claude Desktop:

```json
{
  "mcpServers": {
    "analytics": {
      "command": "npx",
      "args": ["@myorg/mcp-server-analytics"],
      "env": { "DATABASE_URL": "..." }
    }
  }
}
```

### Docker Container

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3001
CMD ["node", "dist/index.js", "--transport", "sse", "--port", "3001"]
```

### Claude Code Integration

Add to `.claude/mcp.json` in your project:

```json
{
  "mcpServers": {
    "project-tools": {
      "command": "node",
      "args": ["./tools/mcp-server.js"],
      "env": {}
    }
  }
}
```

This makes tools available to Claude Code for anyone working on the project.
