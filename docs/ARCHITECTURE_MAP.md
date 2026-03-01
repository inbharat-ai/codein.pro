# 🏗️ CODE-IN ARCHITECTURE MAP

## 2026-02-28 Reality Check Addendum

- Electron packaging tool in use: **electron-builder** (`electron-app/package.json` scripts `pack`, `dist`).
- Electron main process entry: `electron-app/src/main/main.ts`.
- Agent lifecycle manager: `electron-app/src/main/services/AgentService.ts`.
- Agent server entry: `packages/agent/src/index.js`.
- Local runtime manager: `packages/agent/src/model-runtime/index.js`.
- llama.cpp runtime executable name: `llama-server.exe` (Windows), `llama-server` (macOS/Linux).
- Runtime release pin observed in code: `b3906`.

### Active Integration Paths

- Agent process is spawned by Electron main service on port `43120`.
- Local runtime bootstrap is owned by `ModelRuntimeManager.bootstrapRuntime()`.
- Model catalog and defaults are persisted in `~/.codin/models.json`.
- Existing default model behavior is preserved as a hard requirement for additive enhancements.

**Generated**: February 27, 2026  
**Purpose**: Precise repository map for audit and development

---

## 📁 REPOSITORY STRUCTURE

```
Code-In/
├── packages/
│   ├── agent/                      # Backend service (HTTP API on :43120)
│   │   ├── src/
│   │   │   ├── index.js            # ⚠️ MAIN ENTRYPOINT (1560 lines)
│   │   │   ├── router.js           # Model routing logic (37 lines)
│   │   │   ├── store.js            # Local storage for models
│   │   │   ├── audit/              # ✅ Audit logging module
│   │   │   │   └── audit-logger.js
│   │   │   ├── auth/               # ⚠️ JWT manager (NOT INTEGRATED)
│   │   │   │   └── jwt-manager.js
│   │   │   ├── cache/              # ⚠️ Cache manager (NOT WIRED)
│   │   │   │   └── cache-manager.js
│   │   │   ├── i18n/               # ✅ Multilingual system
│   │   │   │   ├── orchestrator.js
│   │   │   │   ├── language-config.js
│   │   │   │   ├── ai4bharat-provider.js
│   │   │   │   ├── stt-provider.js
│   │   │   │   └── tts-provider.js
│   │   │   ├── mcp/                # ⚠️ MCP integration
│   │   │   │   └── client-manager.js
│   │   │   ├── model-runtime/      # ✅ Local LLM runtime
│   │   │   │   ├── index.js
│   │   │   │   ├── router.js
│   │   │   │   └── model-preloader.js
│   │   │   ├── plugins/            # ⚠️ Plugin system (NOT INTEGRATED)
│   │   │   │   └── plugin-manager.js
│   │   │   ├── research/           # ✅ Web research service
│   │   │   │   └── web-research.js
│   │   │   ├── run/                # ✅ Task & process management
│   │   │   │   ├── task-manager.js
│   │   │   │   ├── process-manager.js
│   │   │   │   └── project-detector.js
│   │   │   ├── security/           # ⚠️ Security modules (PARTIAL)
│   │   │   │   ├── sanitizer.js
│   │   │   │   ├── validator.js
│   │   │   │   ├── sandbox.js
│   │   │   │   ├── api-security.js
│   │   │   │   └── keyring.js
│   │   │   └── streaming/          # Streaming support
│   │   ├── test/                   # ⚠️ MINIMAL TESTS
│   │   │   ├── router.test.cjs
│   │   │   └── store.test.cjs
│   │   └── package.json
│   │
│   ├── extension/                  # VS Code extension (frontend)
│   │   ├── src/
│   │   │   ├── extension.ts        # Extension entrypoint
│   │   │   ├── agent/              # Agent communication
│   │   │   ├── apply/              # Edit application
│   │   │   ├── autocomplete/       # Autocomplete logic
│   │   │   ├── commands.ts         # VS Code commands
│   │   │   ├── contract/           # Edit contracts
│   │   │   ├── debug/              # Debug panel
│   │   │   ├── diff/               # Diff viewer
│   │   │   ├── terminal/           # Terminal integration
│   │   │   └── VsCodeIde.ts        # IDE integration
│   │   └── package.json
│   │
│   ├── shared/                     # Shared types/utils
│   │   └── permissions/            # Permission system
│   │       └── manager.js
│   │
│   └── [other packages]
│
├── docs/                           # Documentation
│   ├── WEB_RESEARCH.md
│   ├── I18N_VOICE.md
│   ├── LOCAL_MODEL_RUNTIME.md
│   └── [guides/reference]
│
├── MASTER_AUDIT_2026.md            # Latest audit report
└── AUDIT_REPORT.md                 # Previous audit

```

---

## 🔌 SYSTEM ENTRYPOINTS

### 1. Main Server: `packages/agent/src/index.js`

**Line Count**: 1560 lines  
**Port**: 43120  
**Transport**: HTTP  
**Status**: ⚠️ **Monolithic** (needs refactoring)

**Key Responsibilities**:

1. HTTP server setup
2. 58 HTTP endpoints
3. Module initialization (async imports)
4. Request routing
5. Security middleware (partial)
6. Error handling

**Critical Issues**:

- ❌ No route separation (all in one file)
- ❌ JWT not integrated
- ❌ Cache not wired
- ⚠️ Security applied inconsistently (17% coverage)

---

## 🤖 AGENTS SYSTEM

### Architecture Discovery

**Agent Framework**: ✅ EXISTS  
**Location**: `packages/agent/src/run/task-manager.js`  
**Pattern**: Event-driven task execution with registered handlers

### Current Agents (Implicit, handler-based)

```javascript
// Registered in index.js (lines 107-176)
taskManager.setHandlers({
  "web-search": async (step) => { ... },      // Web search agent
  "fetch-url": async (step) => { ... },       // URL fetcher agent
  "run-command": async (step) => { ... },     // Code execution agent
  "read-file": async (step) => { ... },       // File reader agent
  "write-file": async (step) => { ... },      // File writer agent
  "system-open": async (step) => { ... },     // System opener agent
});
```

### Agent Evaluation

| Agent         | Purpose        | Security         | Logging | Tests | Score |
| ------------- | -------------- | ---------------- | ------- | ----- | ----- |
| `web-search`  | Web research   | ✅ Sanitized     | ✅ Yes  | ❌ No | 6/10  |
| `fetch-url`   | URL fetching   | ✅ Validated     | ✅ Yes  | ❌ No | 7/10  |
| `run-command` | Code execution | ⚠️ Partial       | ✅ Yes  | ❌ No | 5/10  |
| `read-file`   | File reading   | ✅ Validated     | ✅ Yes  | ❌ No | 7/10  |
| `write-file`  | File writing   | ✅ Sanitized     | ✅ Yes  | ❌ No | 7/10  |
| `system-open` | System opener  | ❌ No validation | ✅ Yes  | ❌ No | 4/10  |

### Agent System Issues

1. ❌ **No agent registry** - Agents are implicit, not declarative
2. ❌ **No per-agent permissions** - Global permission system only
3. ❌ **No agent schemas** - Input/output not validated at agent level
4. ❌ **No agent tests** - Cannot verify behavior in isolation
5. ⚠️ **Inconsistent security** - Some agents validated, others not

---

## 🔌 MCP CONNECTORS

### MCP Integration Status

**MCP Manager**: ✅ EXISTS  
**Location**: `packages/agent/src/mcp/client-manager.js`  
**Line Count**: 484 lines  
**Pattern**: Process spawning + IPC communication

### MCP Features

```javascript
class MCPClientManager extends EventEmitter {
  async addServer(name, config)       // Add MCP server
  async removeServer(name)            // Remove MCP server
  async connect(name)                 // Connect to server
  async disconnect(name)              // Disconnect from server
  async callTool(toolName, args)      // Execute tool
  listServers()                       // List all servers
  listTools()                         // List all available tools
}
```

### MCP Endpoints (in index.js)

| Endpoint                        | Method | Validation | Permission | Status          |
| ------------------------------- | ------ | ---------- | ---------- | --------------- |
| `/mcp/servers`                  | GET    | ❌         | ❌         | ⚠️ Unprotected  |
| `/mcp/servers`                  | POST   | ❌         | ❌         | ⚠️ Unprotected  |
| `/mcp/servers/:name`            | DELETE | ❌         | ❌         | ⚠️ Unprotected  |
| `/mcp/servers/:name/connect`    | POST   | ❌         | ❌         | ⚠️ Unprotected  |
| `/mcp/servers/:name/disconnect` | POST   | ❌         | ❌         | ⚠️ Unprotected  |
| `/mcp/tools`                    | GET    | ❌         | ❌         | ⚠️ Unprotected  |
| `/mcp/tools/call`               | POST   | ❌         | ❌         | 🔴 **CRITICAL** |
| `/mcp/activity`                 | GET    | ❌         | ❌         | ⚠️ Unprotected  |

### MCP Critical Issues

1. 🔴 **Zero validation** on MCP endpoints - Can inject malicious server configs
2. 🔴 **No permission checks** - Anyone can add/remove servers
3. 🔴 **No offline fallback** - MCP failure crashes server
4. ❌ **No tool audit logging** - Tool calls not tracked
5. ❌ **No tests** - Cannot verify MCP behavior

---

## 🌐 OFFLINE vs ONLINE BEHAVIOR

### Offline-First Design: ⚠️ PARTIAL

**Local LLM Runtime**: ✅ Works offline (llama.cpp)  
**Translation**: ⚠️ Requires AI4Bharat service (local Python server)  
**Voice STT/TTS**: ⚠️ Requires external engines (Whisper, gTTS)  
**Web Research**: ❌ Requires online access (fails offline)  
**MCP Connectors**: ❌ No offline fallback

### Online Features

| Feature                 | Online Required  | Offline Fallback      | Graceful Degradation |
| ----------------------- | ---------------- | --------------------- | -------------------- |
| Local model inference   | ❌               | ✅ Full functionality | N/A                  |
| Translation (AI4Bharat) | ⚠️ Local service | ❌ None               | 🔴 Fails             |
| Voice STT (Whisper)     | ⚠️ Local binary  | ❌ None               | 🔴 Fails             |
| Voice TTS (gTTS)        | ⚠️ Local binary  | ❌ None               | 🔴 Fails             |
| Web research            | ✅ Yes           | ❌ None               | 🔴 Fails             |
| MCP tools               | ✅ Depends       | ❌ None               | 🔴 Crashes           |

### Offline-First Issues

1. 🔴 **No graceful degradation** - Online features crash when offline
2. ❌ **No offline detection** - Server doesn't know if it's offline
3. ❌ **No offline mode flag** - Cannot explicitly run in offline mode
4. ⚠️ **Dependencies unclear** - Which features work offline?

---

## 🔐 SECURITY ARCHITECTURE

### Security Modules

**Status**: ✅ **Built**, ⚠️ **Partially Integrated**

| Module           | Location                   | Lines | Integrated        | Score |
| ---------------- | -------------------------- | ----- | ----------------- | ----- |
| Input Validation | `security/validator.js`    | ?     | ⚠️ 17% endpoints  | 3/10  |
| Sanitization     | `security/sanitizer.js`    | ?     | ⚠️ 20% endpoints  | 3/10  |
| Sandbox          | `security/sandbox.js`      | 281   | ❌ Not used       | 0/10  |
| JWT Manager      | `auth/jwt-manager.js`      | 327   | ❌ Not integrated | 0/10  |
| Audit Logger     | `audit/audit-logger.js`    | 436   | ⚠️ 5% endpoints   | 2/10  |
| API Security     | `security/api-security.js` | ?     | ❌ Not used       | 0/10  |

### Security Functions (in index.js)

```javascript
function validateAndSanitizeInput(body, schema)     // ✅ Implemented (line 322)
async function requirePermission(...)               // ✅ Implemented (line 423)
async function auditedAction(...)                   // ✅ Implemented (line 433)
```

### Endpoint Security Coverage

**Total Endpoints**: 58  
**With Validation**: 10 (17%)  
**With Permissions**: 3 (5%)  
**With Audit**: 3 (5%)

**Security Score**: 🔴 **2.5/10** (Critical gaps)

---

## 💾 STORAGE ARCHITECTURE

### Local Storage

**Location**: `~/.codin/` (user home directory)

```
~/.codin/
├── models/                 # Downloaded GGUF models
├── runtime/                # llama.cpp binaries
├── i18n/                   # Translation cache
├── mcp/
│   └── servers.json        # MCP server configs
├── logs/
│   ├── agent_activity.jsonl       # Agent activity log
│   ├── mcp_tool_calls.jsonl       # MCP tool calls
│   └── audit-logs/                # Audit logs
├── models.json             # Model registry
└── store.json              # General store
```

### Storage Issues

1. ❌ **No encryption** - Sensitive data stored in plaintext
2. ❌ **No backup/restore** - Data loss risk
3. ❌ **No migration system** - Breaking changes break storage
4. ⚠️ **Hardcoded paths** - Cannot configure storage location

---

## 🌍 MULTILINGUAL SYSTEM

**Status**: ✅ **Excellent** (8.5/10)

**Languages Supported**: 18 Indian languages + English  
**Architecture**: Orchestrator pattern with provider hierarchy

### Components

1. **Language Config**: `i18n/language-config.js` (427 lines) - ✅ Complete
2. **Orchestrator**: `i18n/orchestrator.js` (462 lines) - ✅ Production-ready
3. **AI4Bharat Provider**: `i18n/ai4bharat-provider.js` (220 lines) - ✅ Implements
4. **STT Provider**: `i18n/stt-provider.js` (170 lines) - ✅ Production-ready
5. **TTS Provider**: `i18n/tts-provider.js` (269 lines) - ✅ Production-ready

### Multilingual Issues

1. ⚠️ **Translation endpoints not cached** - Slow repeat translations
2. ⚠️ **No code-switching detection** - Mixed language inputs problematic
3. ❌ **UI not localized** - Backend multilingual, frontend English-only

---

## 🚀 LOCAL LLM RUNTIME

**Status**: ✅ **World-Class** (9/10)

**Location**: `model-runtime/index.js` (623 lines)

### Features

1. ✅ **Automatic llama.cpp bootstrapping** - Downloads platform binary
2. ✅ **Checksum verification** - Security against tampering
3. ✅ **Model catalog** - Qwen2.5, DeepSeek R1
4. ✅ **HuggingFace integration** - Download models from HF
5. ✅ **Local model import** - User-provided .gguf files
6. ✅ **Process management** - Spawns/kills llama-server
7. ✅ **Fallback to system PATH** - Uses installed llama-server if available

### Runtime Issues

1. ⚠️ **No streaming API** - All responses buffered
2. ⚠️ **No concurrency control** - Multiple requests may conflict
3. ❌ **No health checks** - Cannot verify runtime ready
4. ❌ **No graceful shutdown** - Process killed abruptly

---

## ⚡ PERFORMANCE ARCHITECTURE

### Cache System

**Status**: ⚠️ **Built but NOT Wired** (0/10 integration)

**Location**: `cache/cache-manager.js`  
**Features**: LRU eviction, TTL, pattern invalidation, stats tracking  
**Usage**: Initialized (line 37 of index.js) but **NEVER USED**

### Performance Issues

1. 🔴 **Cache not wired** - 500-2000x slower than possible
2. ❌ **No streaming** - All responses buffered
3. ❌ **No connection pooling** - New connections every request
4. ❌ **No load balancing** - Single process, no clustering

---

## 🧪 TESTING ARCHITECTURE

**Status**: 🔴 **Nearly Zero** (0.5/10)

**Test Files Found**:

- `test/router.test.cjs` - Minimal/empty
- `test/store.test.cjs` - Minimal/empty

**Test Coverage**: **~0%**

### Testing Gaps

1. 🔴 **No unit tests** - Cannot verify individual functions
2. 🔴 **No integration tests** - Cannot verify endpoints
3. 🔴 **No security tests** - Cannot verify injection protection
4. 🔴 **No performance tests** - No latency benchmarks
5. 🔴 **No CI/CD** - No automated testing

---

## 📊 MODULE DEPENDENCY GRAPH

```
index.js (MAIN)
├─► router.js (model routing)
├─► store.js (local storage)
├─► security/
│   ├─► sanitizer.js ✅
│   ├─► validator.js ✅
│   └─► sandbox.js ❌ NOT USED
├─► cache/cache-manager.js ❌ NOT WIRED
├─► audit/audit-logger.js ⚠️ PARTIAL
├─► auth/jwt-manager.js ❌ NOT INTEGRATED
├─► i18n/
│   ├─► orchestrator.js ✅
│   ├─► ai4bharat-provider.js ✅
│   ├─► stt-provider.js ✅
│   └─► tts-provider.js ✅
├─► model-runtime/
│   ├─► index.js ✅
│   └─► router.js ✅
├─► mcp/client-manager.js ⚠️ UNSAFE
├─► plugins/plugin-manager.js ❌ NOT INTEGRATED
├─► research/web-research.js ✅
├─► run/
│   ├─► task-manager.js ✅
│   ├─► process-manager.js ✅
│   └─► project-detector.js ✅
└─► shared/permissions/manager.js ✅
```

**Legend**:

- ✅ Integrated and working
- ⚠️ Partially integrated or unsafe
- ❌ Built but not integrated

---

## 🎯 CRITICAL FINDINGS

### Top 10 Architectural Issues

1. 🔴 **JWT not integrated** (auth/jwt-manager.js exists but unused)
2. 🔴 **Cache not wired** (cache-manager.js exists but unused)
3. 🔴 **MCP endpoints unprotected** (8 endpoints with zero security)
4. 🔴 **Sandbox not applied** (code execution not isolated)
5. 🔴 **83% endpoints lack validation** (48/58 unprotected)
6. 🔴 **Zero tests** (cannot verify functionality)
7. 🔴 **No offline fallback** (online features crash offline)
8. 🔴 **Plugin system not integrated** (plugin-manager.js unused)
9. 🔴 **No graceful degradation** (failures cascade)
10. 🔴 **Monolithic index.js** (1560 lines, needs refactoring)

---

## 📈 OVERALL ARCHITECTURE SCORE

| Dimension         | Score      | Status                      |
| ----------------- | ---------- | --------------------------- |
| Core Architecture | 7/10       | ✅ Good modularity          |
| Agents System     | 5/10       | ⚠️ Implicit, no registry    |
| MCP Integration   | 3/10       | 🔴 Unsafe, unprotected      |
| Security          | 2.5/10     | 🔴 Critical gaps            |
| Performance       | 1/10       | 🔴 Cache not wired          |
| Multilingual      | 8.5/10     | ✅ World-class              |
| Local Runtime     | 9/10       | ✅ Excellent                |
| Testing           | 0.5/10     | 🔴 Nearly zero              |
| Offline-First     | 4/10       | ⚠️ Partial                  |
| **TOTAL**         | **5.6/10** | 🔴 **NOT Production-Ready** |

---

## 🛠️ RECOMMENDED REFACTORING

### Phase 1: Security (CRITICAL)

1. Integrate JWT middleware
2. Apply validation to all endpoints
3. Fix permission fail-closed
4. Protect MCP endpoints
5. Apply sandbox to code execution

### Phase 2: Performance

1. Wire cache to hot endpoints
2. Add streaming support
3. Implement connection pooling

### Phase 3: Architecture

1. Split index.js into route modules
2. Create agent registry
3. Add offline mode support
4. Implement graceful degradation

### Phase 4: Testing

1. Unit tests (>80% coverage)
2. Integration tests (all endpoints)
3. Security tests (injection, auth bypass)
4. CI/CD pipeline

---

**End of Architecture Map**
