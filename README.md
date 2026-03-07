# CodIn

<div align="center">

<img src="./landing/assets/codein-logo.png" alt="CodIn logo" width="96" />

![CodIn](https://img.shields.io/badge/CodIn-v1.0.0-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-20.19+-green?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue?style=for-the-badge&logo=typescript)
![License](https://img.shields.io/badge/License-Apache--2.0-orange?style=for-the-badge)

**By Bharat, for the world.**

CodIn is a full AI coding tool in the Cursor/Copilot class: local-first agent runtime, autonomous workflows, multilingual support, and production-safe orchestration.

</div>

---

## What CodIn Is

CodIn is not just a plugin. It is a complete AI coding system with:

- Client interfaces (desktop/IDE adapters)
- A local agent runtime (`packages/agent`)
- Multi-agent orchestration (swarm, routing, sessions, pipeline)
- Built-in research, observability, and reliability guardrails

If you are evaluating CodIn against Cursor/Copilot, the closest mental model is:

- Cursor/Copilot style UX
- Plus local-first runtime control
- Plus explicit orchestration and systems visibility

## Why It Is Different

### Salient Production Features

- **Client <-> Agent live bridge** over HTTP + SSE for task streaming and permission loops
- **Intelligent compute routing** across local runtime, swarm, and GPU
- **Session-isolated execution** for safer multi-user and parallel workflows
- **Reliability guardrails** in core agent loops:
  - circuit breaker
  - retry with backoff
  - per-call and global timeout protection
  - repeated-tool/infinite-loop detection
- **Built-in observability endpoints** for health, compute, sessions, agents, pipeline, metrics
- **Serper-compatible research API** without forcing external API keys

### Capabilities Rarely Unified in One Toolchain

- No-key research compatibility endpoint: `POST /api/research/serper`
- Unified local/swarm/GPU routing in one runtime
- API-driven autonomous coding pipeline (idea -> spec -> code -> test -> review -> delivery)
- Tool-execution safety built into base agent behavior, not bolted on later

## Corrected Architecture

This reflects the current repository implementation.

```text
+----------------------------------------------------------+
|                   CodIn Clients                          |
|  - Desktop shell / Electron app                          |
|  - IDE integration adapter (packages/extension)          |
|  - GUI workflow panels (gui/)                            |
+---------------------------+------------------------------+
                            |
                            | HTTP + SSE
                            v
+----------------------------------------------------------+
|                CodIn Agent Runtime (43120)               |
|  Auth | Runtime | i18n | Research | MCP | Run | Compute  |
|  Swarm | Routing | Sessions | Status | Pipeline | Vibe    |
+---------------------------+------------------------------+
                            |
                            v
+----------------------------------------------------------+
|                Execution and Orchestration               |
|  - MAS agents and topologies                             |
|  - Compute selector (local/swarm/GPU)                   |
|  - Session manager (isolation + TTL)                     |
|  - Reliability engine (retry/timeout/circuit breaker)    |
|  - Model runtime + external providers                    |
+----------------------------------------------------------+
```

### Route Surface (from `packages/agent/src/routes/registry.js`)

- `auth`, `models`, `runtime`, `i18n`, `research`, `mcp`
- `agent-tasks`, `run`, `permissions`, `performance`, `external-providers`
- `intelligence`, `compute`, `swarm`, `vibe`
- `routing`, `sessions`, `status`, `pipeline`

## End-to-End Flow

```text
Client action
  -> POST /swarm/tasks
  -> Agent orchestrates (classify -> route -> execute)
  -> SSE stream from GET /swarm/events
  -> Client submits permission decisions (if needed)
  -> Results from GET /swarm/tasks/:taskId/results
```

Key validation endpoints:

- `GET /api/health`
- `GET /status`
- `GET /status/compute`
- `GET /status/sessions`
- `GET /status/agents`
- `GET /metrics`

## Quick Start

### Prerequisites

- Node.js `>=20.19`
- Python `>=3.8` (for i18n components)

### 1) Run Agent Runtime

```bash
cd packages/agent
npm install
npm start
```

Expected:

```text
CodIn Agent listening on http://127.0.0.1:43120
All subsystems loaded
```

### 2) Verify Runtime Health

```bash
curl http://127.0.0.1:43120/api/health
curl http://127.0.0.1:43120/status
curl http://127.0.0.1:43120/status/compute
```

### 3) Run Client Layer

Choose your interface path:

- Desktop path: see `electron-app/README.md`
- IDE integration path: see `packages/extension/README.md`
- GUI workflow development: see `gui/README.md`

## Research API (Serper-Compatible)

```bash
curl -X POST http://127.0.0.1:43120/api/research/serper \
  -H "Content-Type: application/json" \
  -d '{"query":"React hooks tutorial","num_results":5}'
```

Other research routes:

- `POST /api/research/web-search`
- `POST /api/research/fetch-url`
- `POST /api/research/code-documentation-search`
- `POST /api/research/code-example-search`
- `POST /api/research/bug-solution-search`

## Repository Map

- `packages/agent`: core runtime and orchestration server
- `packages/extension`: IDE integration adapter
- `gui`: workflow UI panels and chat surfaces
- `electron-app`: standalone CodIn desktop shell
- `core`: shared engine/runtime modules
- `landing`: public website and distribution surface

## Security and Reliability

- Telemetry-off local-first default
- Permission-gated destructive operations
- Structured audit logging
- Timeout and retry protection in critical agent loops
- Circuit-breaker backed LLM/tool execution paths

See:

- `SECURITY.md`
- `SECURITY_AND_INTEGRATION.md`
- `ARCHITECTURE.md`
- `BACKEND_API_REFERENCE.md`

## Testing

Run top-level tests:

```bash
npm test
```

Agent-only tests:

```bash
cd packages/agent
npm test
```

## Contributing

- Read `CONTRIBUTING.md`
- Follow `DEVELOPMENT.md`
- Keep claims in docs aligned with implemented routes and runtime behavior

## License

Apache 2.0 (`LICENSE`)

---

<div align="center">

**Made by Bharat for the world**

[Star on GitHub](https://github.com/inbharat-ai/codein.pro) • [Issues](https://github.com/inbharat-ai/codein.pro/issues) • [Docs](./docs/)

</div>
