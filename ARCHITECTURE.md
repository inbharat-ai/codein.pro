# CodeIn Architecture

CodeIn is a local-first AI coding IDE built on Electron + React. The application ships as a desktop app where a React GUI communicates with the Electron main process over IPC, which in turn manages a Node.js agent runtime running as a child process on localhost port 43120. The agent handles all LLM calls, tool execution, multi-agent orchestration, and file operations. No user data leaves the machine unless the user explicitly configures a cloud LLM provider.

---

## Package Responsibilities

### `gui/`

React 18 + Vite frontend loaded in the Electron renderer process. Contains all UI: Monaco editor, xterm.js terminal, TipTap chat input, voice panel, swarm dashboard, compute panel, and model config. State lives in Redux Toolkit. The GUI never calls the agent HTTP API directly — all calls go through Electron IPC to the main process, which proxies to the agent or handles them natively.

### `electron-app/`

Electron main process written in TypeScript. Responsible for:

- Spawning and health-checking the agent child process (`AgentService`)
- Exposing IPC handlers (`IpcHandler`) that bridge renderer requests to agent HTTP calls or native OS services
- Native services: `FileSystemService`, `GitService`, `TerminalService` (node-pty), `ModelManagerService`, `MediaService`
- Window lifecycle, app menus, auto-update

### `packages/agent/`

Node.js HTTP server (plain `node:http`, no framework) binding to `127.0.0.1:43120`. This is the core runtime:

- 27 route modules under `src/routes/`
- Multi-Agent Swarm (MAS) with 13 specialist agents under `src/mas/agents/`
- Model runtime supporting 50+ LLM providers via `src/model-runtime/`
- Security subsystem: `Sanitizer`, `Validator`, `Sandbox` (worker threads), `JWTManager`, `AuditLogger`
- SQLite persistence via `src/mas/sqlite-store.js` for sessions, memory, and audit logs
- i18n orchestration for 19 Indian languages under `src/i18n/`

### `core/`

Shared TypeScript library consumed by both the GUI and agent. Contains type definitions, edit-contract schemas, JSON patch utilities, and validation helpers.

---

## Data Flow

```
User types in Chat (GUI/renderer)
  → Redux action dispatched (sessionSlice)
  → Electron IPC call (ipcRenderer.invoke)
    → IpcHandler in main process
      → HTTP POST to agent at 127.0.0.1:43120/run or /sessions/:id/chat
        → Auth middleware (JWT check)
        → Rate limiter + input sanitizer/validator
        → Router decision (model selection, cost routing)
        → LLM provider call (streaming SSE or JSON)
          → Response streamed back through HTTP
        → Tool calls executed in Sandbox worker if needed
        → Response written to SQLite session store
      → HTTP response streamed back to IpcHandler
    → IPC reply sent to renderer
  → Redux streaming reducers update chat state
User sees streamed response tokens in GUI
```

---

## State Management

### Redux Slices (GUI in-memory state)

| Slice           | Responsibility                                                            |
| --------------- | ------------------------------------------------------------------------- |
| `sessionSlice`  | Active chat sessions, message history, streaming state, tool call results |
| `swarmSlice`    | Multi-agent task graph, agent statuses, topology                          |
| `configSlice`   | User preferences, active model, provider keys                             |
| `profilesSlice` | Named agent profiles and system prompts                                   |
| `uiSlice`       | Panel visibility, layout, modals                                          |
| `tabsSlice`     | Editor tab state                                                          |
| `computerSlice` | Computer-use agent screen state                                           |
| `aiHubSlice`    | AI Hub panel state                                                        |
| `indexingSlice` | Repo indexing progress                                                    |

### SQLite (agent persistent state)

The agent uses `better-sqlite3` (via `src/mas/sqlite-store.js`) to persist:

- Session transcripts and message history
- Three-tier agent memory: working memory, episodic memory, semantic memory
- Audit log records
- Idempotency keys for request deduplication

Redux holds the live session view; SQLite is the source of truth on disk. On session load the agent reads SQLite and the GUI hydrates Redux from the HTTP response.

---

## Security Layers (in order of execution)

1. **Network boundary**: Agent binds only to `127.0.0.1` — no external exposure.
2. **JWT authentication**: Every request to `/` routes (except public health/status) is validated by `JWTManager`. Tokens are issued at agent startup and stored in the Electron keychain via `src/security/keyring.js`.
3. **Rate limiting**: `RateLimiter` middleware enforces per-IP and per-token request limits.
4. **Input sanitization**: `Sanitizer` strips injection patterns from all string inputs before they reach route handlers.
5. **Input validation**: `Validator` checks path traversal, allowed directory allowlists, and schema conformance.
6. **Sandbox execution**: Tool calls and arbitrary code run in isolated worker threads (`src/security/sandbox-worker.js`) with a 30-second timeout and a maximum of 5 concurrent workers.
7. **Audit logging**: `AuditLogger` writes structured logs for every mutating operation to `data/audit-logs/`.
8. **IPC path validation**: `IpcHandler` in the Electron main process validates file paths for null bytes and sensitive system directories before forwarding any FS operation.
9. **Fail-closed permissions**: `permissionManager` denies by default; capabilities must be explicitly granted per session.

---

## Key Ports and Protocols

| Endpoint                    | Protocol                | Purpose                                                  |
| --------------------------- | ----------------------- | -------------------------------------------------------- |
| `127.0.0.1:43120`           | HTTP/1.1 + SSE          | Agent REST API and streaming LLM responses               |
| Electron IPC                | `ipcMain`/`ipcRenderer` | GUI ↔ main process communication                        |
| `127.0.0.1:3456` (optional) | HTTP                    | Local llama.cpp model server (when running local models) |
| WebSocket (optional)        | WS                      | MCP (Model Context Protocol) tool server connections     |

The agent's 27 route modules cover: sessions, run, swarm, models, compute, git, i18n, intelligence, mcp, pipeline, performance, permissions, routing, research, vibe, auth, registry, agent-tasks, api-contracts, computer, external-providers, micro-router, repo-intelligence, runtime, status, swarm-validators, and vibe-builder.
