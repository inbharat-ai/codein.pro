# CodeIn Compute — Architecture Document

> Generated: 2026-02-28 | Version: 1.0

## 1. Overview

CodeIn Compute is a job-runner layer that takes a user "outcome" (goal), plans tasks, executes them via internal agents + tools, stores artifacts, and streams progress to UI. It operates offline-first using local llama.cpp models, with optional escalation to external APIs.

## 2. Current System Map

### 2.1 Agent System

| Component      | Path                                      | Responsibility                                     |
| -------------- | ----------------------------------------- | -------------------------------------------------- |
| Agent Registry | `packages/agent/src/agents/registry.js`   | In-memory agent registration + capability tracking |
| Route Registry | `packages/agent/src/routes/registry.js`   | DI-based route wiring (12 modules)                 |
| Main Server    | `packages/agent/src/index.js` (785 lines) | HTTP server bootstrap on port 43120                |

### 2.2 Model Runtime

| Component          | Path                                                                 | Responsibility                                              |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Runtime Manager    | `packages/agent/src/model-runtime/index.js` (672 lines)              | llama.cpp binary management, GGUF download, inference spawn |
| Model Router       | `packages/agent/src/model-runtime/router.js` (490 lines)             | Task classification (9 categories), composite model scoring |
| External Providers | `packages/agent/src/model-runtime/external-providers.js` (468 lines) | OpenAI/Anthropic/Gemini BYO-key adapter                     |

### 2.3 Multilingual Pipeline

| Component         | Path                                                                | Responsibility                               |
| ----------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| Orchestrator      | `packages/agent/src/i18n/orchestrator.js` (551 lines)               | Central STT/TTS/translate coordinator        |
| Language Detector | `packages/agent/src/i18n/language-detector.js` (271 lines)          | Unicode-range script detection, 18 languages |
| STT Provider      | `packages/agent/src/i18n/stt-provider.js` (320 lines)               | Whisper CLI/Python, 13 Indian languages      |
| TTS Provider      | `packages/agent/src/i18n/tts-provider.js` (458 lines)               | gTTS → Piper → espeak fallback chain         |
| Term Preservator  | `packages/agent/src/i18n/technical-term-preservator.js` (422 lines) | 16+ regex patterns, 150+ keywords            |
| AI4Bharat         | `packages/agent/src/i18n/ai4bharat-provider.js` (220 lines)         | Python microservice client                   |
| Language Config   | `packages/agent/src/i18n/language-config.js` (427 lines)            | 19 language definitions                      |
| Hardener          | `packages/agent/src/i18n/multilingual-hardener.js`                  | Confidence-based quality checks              |

### 2.4 MCP Tools

| Component        | Path                                                   | Responsibility                           |
| ---------------- | ------------------------------------------------------ | ---------------------------------------- |
| Client Manager   | `packages/agent/src/mcp/client-manager.js` (484 lines) | Stdio JSON-RPC 2.0 MCP server management |
| Health Checker   | `packages/agent/src/mcp/health-checker.js`             | Server health monitoring                 |
| Offline Fallback | `packages/agent/src/mcp/offline-fallback.js`           | Fallback chain (simulated callServer)    |

### 2.5 Security

| Component    | Path                                                      | Responsibility                                            |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| Validator    | `packages/agent/src/security/validator.js` (339 lines)    | Path traversal prevention, command whitelisting           |
| API Security | `packages/agent/src/security/api-security.js` (378 lines) | Helmet/CORS/rate-limit (Express, NOT used by main server) |
| Sandbox      | `packages/agent/src/security/sandbox.js` (281 lines)      | Worker-thread code execution                              |
| Keyring      | `packages/agent/src/security/keyring.js` (443 lines)      | AES-256-GCM secret storage                                |
| Permissions  | `packages/agent/src/routes/permissions.js`                | Consent-based permission endpoints                        |

### 2.6 Infrastructure

| Component         | Path                                                            | Responsibility                                    |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| Store             | `packages/agent/src/store.js`                                   | JSON file persistence (~/.codin/model-store.json) |
| Cache             | `packages/agent/src/cache/cache-manager.js` (277 lines)         | LRU+TTL in-memory cache                           |
| HTTP Pool         | `packages/agent/src/cache/http-pool.js` (291 lines)             | HTTP keep-alive connection pooling                |
| Response Streamer | `packages/agent/src/streaming/response-streamer.js` (280 lines) | SSE with backpressure                             |
| Config            | `packages/agent/src/config/index.js`                            | dotenv-based config loading                       |
| Logger            | `packages/agent/src/logger/index.js`                            | pino logger                                       |
| Audit Logger      | `packages/agent/src/audit/`                                     | Rotating JSONL audit trail                        |
| JWT Manager       | `packages/agent/src/auth/jwt-manager.js`                        | HS256 token management                            |

### 2.7 Core Tools

| Path                                                                                                          | Count                    |
| ------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `core/tools/definitions/`                                                                                     | ~20 tool definitions     |
| `core/tools/implementations/`                                                                                 | ~18 tool implementations |
| Key tools: readFile, createNewFile, runTerminalCommand, editFile, grepSearch, searchWeb, viewDiff, globSearch |

### 2.8 Electron Services

| Service             | Path                                                    | Responsibility            |
| ------------------- | ------------------------------------------------------- | ------------------------- |
| AgentService        | `electron-app/src/main/services/AgentService.ts`        | Spawns agent, HTTP bridge |
| ModelManagerService | `electron-app/src/main/services/ModelManagerService.ts` | GGUF model management     |
| FileSystemService   | `electron-app/src/main/services/FileSystemService.ts`   | File CRUD + chokidar      |
| GitService          | `electron-app/src/main/services/GitService.ts`          | simple-git wrapper        |
| TerminalService     | `electron-app/src/main/services/TerminalService.ts`     | node-pty terminals        |

### 2.9 Intelligence Pipeline

| Component             | Path                                                                   | Responsibility                        |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| Hybrid Orchestrator   | `packages/agent/src/intelligence/hybrid-orchestrator.js` (339 lines)   | Full pipeline coordinator             |
| Complexity Classifier | `packages/agent/src/intelligence/complexity-classifier.js` (282 lines) | 30 regex patterns                     |
| Confidence Scorer     | `packages/agent/src/intelligence/confidence-scorer.js` (210 lines)     | Weighted composite scoring            |
| Verification Engine   | `packages/agent/src/intelligence/verification-engine.js` (605 lines)   | Syntax + hallucination detection      |
| Budget Guardrails     | `packages/agent/src/intelligence/budget-guardrails.js` (255 lines)     | Per-request/hourly/daily/monthly caps |

## 3. Compute Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     CodeIn Compute Layer                      │
│                                                              │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Job API  │→ │ Planner  │→ │ Executor │→ │ Artifact Mgr │ │
│  │ (REST)   │  │ (LLM)   │  │ (Steps)  │  │ (File Store) │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘ │
│       │              │              │                          │
│  ┌────┴─────┐  ┌────┴─────┐  ┌────┴──────────────┐          │
│  │ Job Store │  │ Model    │  │ Compute Sandbox    │          │
│  │ (JSON)   │  │ Router   │  │ (Isolated FS +     │          │
│  └──────────┘  │ + Runtime │  │  Permissions)      │          │
│                └──────────┘  └────────────────────┘          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Event Stream (SSE)                       │    │
│  │  job.progress | job.step | job.log | job.artifact     │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
       ↕                    ↕                    ↕
  Existing Agent       Existing i18n        Existing MCP
  (port 43120)         Pipeline             Tools
```

### 3.1 Module Structure

```
packages/agent/src/compute/
├── index.js           — Module entry, exports all compute components
├── job-store.js       — Job CRUD, JSON file persistence
├── job-model.js       — Job/Step data models, validation
├── state-machine.js   — Job state transitions with guards
├── planner.js         — LLM-based task planning
├── executor.js        — Step-by-step execution with retry
├── sandbox.js         — Isolated workspace + permission gating
├── policy.js          — Policy file parser + enforcer
├── escalation.js      — External API escalation logic
├── event-stream.js    — SSE event emitter for job progress
├── artifact-manager.js — File/report/diff artifact storage
└── workflows/
    ├── fix-build.js   — "Fix my build" demo workflow
    ├── feature-spec.js — "Create feature spec" demo workflow
    └── research-code.js — "Research + code" demo workflow
```

### 3.2 Integration Points

- **Routes**: New `packages/agent/src/routes/compute.js` registered via route registry
- **Model Router**: Planner uses existing `modelRouter.route()` for task classification
- **Model Runtime**: Executor uses existing `modelRuntime.startInference()` for local LLM
- **External Providers**: Escalation uses existing `externalProviders.completeWithFallback()`
- **i18n**: Input/output language detection + translation via `i18nOrchestrator`
- **MCP Tools**: Steps can invoke MCP tools via `mcpClientManager.callTool()`
- **Streaming**: Job events use existing `ResponseStreamer` SSE infrastructure
- **Security**: Compute sandbox extends existing `Validator` for path checks

### 3.3 Data Flow

1. User submits goal → `POST /compute/jobs`
2. Job created (status: `queued`) → stored to `~/.codin/compute/jobs/<jobId>.json`
3. Language detected → translated to English if needed (term-preserved)
4. Planner generates step plan via local LLM → status: `planning` → `running`
5. Executor runs each step:
   a. Resolve agent + tool for step
   b. Check permissions against job policy
   c. Execute in sandbox workspace
   d. Store artifacts in `~/.codin/compute/<jobId>/artifacts/`
   e. Emit SSE events
6. On completion → translate outputs back to user language
7. Status: `completed` (or `failed` with error details)

### 3.4 Security Model

- Each job gets isolated workspace: `~/.codin/compute/<jobId>/`
- Policy file controls: network, browser, FS write, repo write, allowed domains/tools
- All tool calls pass through PermissionManager (fail-closed)
- No shell injection: `child_process.spawn()` with args array only
- Secrets never sent to external APIs unless explicitly configured
- Network access default OFF

## 4. V1 Scope

- Sequential step execution (no parallel agents)
- Local storage only (no remote compute)
- 3 demo workflows
- SSE progress streaming
- Multilingual I/O with term preservation
- Optional external API escalation with budget caps
