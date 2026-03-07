# CodIn Multi-Agent Swarm (MAS)

Production-grade multi-agent orchestration for CodIn — autonomous task decomposition,
specialist routing, topology-aware execution, and real-time event streaming.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      SwarmManager                            │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ AgentPool │  │ TopologyLayer│  │   PermissionGate      │  │
│  │ (Router)  │  │ mesh│star│…  │  │ fail-closed + GPU $   │  │
│  └────┬─────┘  └──────┬───────┘  └───────────┬───────────┘  │
│       │               │                       │              │
│  ┌────▼────────────────▼───────────────────────▼──────────┐  │
│  │  Specialist Agents (planner, coder, test, debug, …)    │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 3-Tier Mem │  │ BatchPlanner │  │  JsonPatchEngine     │  │
│  │ ST/WM/LT   │  │ + Executor   │  │  RFC 6902 + repair   │  │
│  └────────────┘  └──────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         ▲                                      ▲
         │  HTTP REST (16 endpoints)            │  MCP (11 tools)
         │  SSE event stream                    │
    ┌────┴────────────────────────────────────────┐
    │  VS Code Extension / GUI SwarmPanel         │
    └─────────────────────────────────────────────┘
```

## Quick Start

```js
const { SwarmManager } = require("./swarm-manager");

const swarm = new SwarmManager({ runLLM: myLLMFunction });

// Initialize with star topology, 5 agents max
await swarm.swarmInit({
  topology: "star",
  maxAgents: 5,
  concurrency: 3,
  gpuBudgetUSD: 2.0,
});

// Orchestrate a task
const result = await swarm.taskOrchestrate({
  goal: "Add dark mode to the settings page",
  mode: "implement",
  topology: "hierarchical",
});

// Check status
const status = swarm.swarmStatus();

// Respond to permission requests
const pending = swarm.getPendingPermissions();
swarm.respondToPermission(pending[0].id, "approve_once");

// Shutdown
await swarm.swarmShutdown();
```

---

## Modules

### types.js — Data Models

All enums are `Object.freeze`d. All IDs are cryptographically random with prefixes.

| Enum                  | Values                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `TOPOLOGY`            | `MESH`, `HIERARCHICAL`, `RING`, `STAR`                                                               |
| `AGENT_TYPE`          | `PLANNER`, `CODER`, `TEST`, `DEBUG`, `I18N`, `VIBE_BUILDER`, `INFRA`, `SECURITY`, `DOCS`, `REVIEWER` |
| `AGENT_STATUS`        | `IDLE`, `BUSY`, `BLOCKED`, `ERROR`, `SHUTDOWN`                                                       |
| `NODE_STATUS`         | `QUEUED`, `RUNNING`, `BLOCKED`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `RETRYING`                       |
| `EVENT_TYPE`          | 26 event types for full lifecycle tracking                                                           |
| `PERMISSION_TYPE`     | `FILE_READ`, `FILE_WRITE`, `COMMAND_RUN`, `GIT_OP`, `NETWORK`, `MCP_TOOL_CALL`, `REMOTE_GPU_SPEND`   |
| `PERMISSION_DECISION` | `ALLOWED`, `BLOCKED`, `NEEDS_APPROVAL`                                                               |
| `PERMISSION_RESPONSE` | `APPROVE_ONCE`, `APPROVE_ALWAYS`, `DENY`                                                             |

**ID Generators:** `swarmId()`, `agentId()`, `nodeId()`, `taskId()`, `eventId()`

**Factories:**

- `createSwarmConfig(opts)` — Topology, strategy, agent/concurrency caps, GPU budget
- `createAgentDescriptor({type, modelHint, constraints})` — Agent identity + metrics
- `createTaskNode({goal, agentType, dependencies, requiredPermissions})` — DAG node
- `createTaskGraph({goal, mode, executionStrategy, topology})` — Full task DAG
- `createSwarmEvent({type, agentId, nodeId, taskId, data})` — Timestamped event
- `createPermissionRequest({nodeId, agentId, permissionType, action, costEstimate})` — Pending request

**Validators** return `{valid, errors[]}`:

- `validateSwarmConfig(config)` — Checks topology, bounds, types
- `validateTaskNode(node)` — Checks ID prefix, required fields
- `validateTaskGraph(graph)` — Cycle detection via DFS on edges

---

### memory.js — Three-Tier Memory

| Tier              | Scope           | Persistence                                 | Default TTL |
| ----------------- | --------------- | ------------------------------------------- | ----------- |
| `ShortTermMemory` | Ephemeral cache | In-memory, auto-prune                       | 30 min      |
| `WorkingMemory`   | Session state   | In-memory                                   | None        |
| `LongTermMemory`  | Cross-session   | File (`~/.codein/swarm/{hash}/memory.json`) | 24 hours    |

**ShortTermMemory(defaultTTLMs)**

- `set(key, value, ttlMs?)`, `get(key)`, `has(key)`, `delete(key)`, `keys()`, `size()`, `prune()`, `clear()`, `destroy()`

**WorkingMemory()**

- Key-value: `set(key, value)`, `get(key)`, `has(key)`, `delete(key)`
- Decisions: `recordDecision(obj)`, `getDecisionHistory()` (max 500)
- Plan: `setPlan(plan)`, `getPlan()`
- Budget: `trackCost(amount)`, `getBudget()`
- Permissions: `setPermissionGrant(key, grant)`, `getPermissionGrant(key)`
- Files: `setFileSummary(path, summary)`, `getFileSummary(path)`
- Language: `setLanguage(lang)`, `getLanguage()`

**MemoryManager({workspaceHash, longTermEnabled, emitEvent})**

- Properties: `.shortTerm`, `.working`, `.longTerm`
- Lifecycle hooks: `onSwarmInit()`, `onTaskStart()`, `onNodeStart()`, `onNodeEnd()`, `onPatchApplied()`, `onPermissionDecision()`, `onTaskComplete()`
- `usage()` → tier stats, `pruneAll()`, `destroy()`

**Security:** `stripSecrets(value)` redacts `sk-*`, `ghp_*`, JWTs, and keys named `apiKey`, `secret`, `password`, `token`, `credential`.

---

### permissions.js — Permission Gate

Fail-closed by default. Only `FILE_READ` is auto-approved.

```js
const gate = new PermissionGate({ memory, emitEvent, gpuConfig });

const { decision, reason } = await gate.requestPermission({
  nodeId,
  agentId,
  permissionType,
  action,
  costEstimate,
});
// decision: "allowed" | "blocked" | "needs_approval"

// User responds to pending request:
gate.respondToRequest(requestId, "approve_once"); // or "approve_always", "deny"
```

**GPU Guardrails:**

- Default budget: $2.00, hard cap: $100.00
- Session TTL: 30 min, idle timeout: 10 min
- `getGpuStatus()` → `{budget, spent, remaining, sessionStart, lastActivity, sessionExpired, idleExpired}`

Other: `getPendingRequests()`, `getPendingCount()`, `getAuditLog(limit)`, `cancelAllPending()`, `destroy()`

---

### agents/ — Specialist Agents

10 agent types, all extending `BaseAgent`:

| Type           | Class            | Specialization                       |
| -------------- | ---------------- | ------------------------------------ |
| `planner`      | PlannerAgent     | Task decomposition, DAG construction |
| `coder`        | CoderAgent       | Code generation, implementation      |
| `test`         | TesterAgent      | Test writing, coverage               |
| `debug`        | DebuggerAgent    | Error diagnosis, fix proposals       |
| `i18n`         | I18nAgent        | Internationalization                 |
| `vibe_builder` | VibeBuilderAgent | UI/UX, styling                       |
| `infra`        | DevOpsAgent      | CI/CD, Docker, infrastructure        |
| `security`     | SecurityAgent    | Vulnerability scanning               |
| `docs`         | DocsAgent        | Documentation generation             |
| `reviewer`     | ReviewerAgent    | Code review, quality checks          |

**BaseAgent({type, modelHint, constraints}, {permissionGate, memory, emitEvent, runLLM})**

| Method                                           | Description                     |
| ------------------------------------------------ | ------------------------------- |
| `activate()`                                     | Set BUSY, emit AGENT_SPAWN      |
| `deactivate()`                                   | Set IDLE                        |
| `markFailed(reason)`                             | Set ERROR, emit AGENT_REMOVE    |
| `terminate()`                                    | Set SHUTDOWN, emit AGENT_REMOVE |
| `callLLM(prompt, opts?)`                         | Call LLM with metrics tracking  |
| `callLLMJson(prompt, opts?)`                     | Call LLM, parse JSON response   |
| `requestPermission(nodeId, type, action, cost?)` | Gate check                      |
| `remember(key, value)` / `recall(key)`           | Per-agent memory                |

Each specialist overrides: `getSystemPrompt()`, `execute(node, context)`, `describeCapabilities()`.

**Factory:** `createAgent(type, deps)` — Instantiates the correct class via `AGENT_CLASS_MAP`.

---

### agent-router.js — Pool Management

```js
const router = new AgentRouter({ maxAgents: 10 }, deps);

const agent = router.route("coder"); // find idle or spawn new
router.release(agent.id); // return to idle
router.list({ type: "coder" }); // filtered descriptors
router.metrics(); // aggregated pool metrics
router.shutdown(); // terminate all
```

- Evicts `SHUTDOWN`/`ERROR` agents when pool is full
- Throws if pool is at capacity with no evictable agents

---

### topologies/ — Execution Schedulers

Each scheduler implements: `buildGraph(taskGraph)`, `getNextNodes(taskGraph)`, `checkIteration(taskGraph)`, `resetForIteration(taskGraph)`.

| Topology         | Behavior                                                 |
| ---------------- | -------------------------------------------------------- |
| **Mesh**         | All nodes parallel, no dependencies                      |
| **Star**         | All nodes parallel, score-based merge at end             |
| **Ring**         | Sequential chain, one node at a time, supports iteration |
| **Hierarchical** | Planner first, then workers in parallel                  |

Factory: `createTopologyScheduler(topology)` using `TOPOLOGY_MAP`.

---

### batch.js — Batch Optimization

Groups operations by safety profile for maximum parallelism.

```js
const planner = new BatchPlanner();
const groups = planner.analyze(operations);
// operations: [{type, target, action, dependencies?, data?}]

const executor = new BatchExecutor({ executeOp, emitEvent, maxParallel: 5 });
const results = await executor.execute(groups);
```

| Category    | Types                                  | Parallel?       |
| ----------- | -------------------------------------- | --------------- |
| Safe        | `read`, `search`, `memory`, `mcp_safe` | Yes             |
| Write       | `write`                                | Per-file serial |
| Destructive | `destructive`, `command`               | Always serial   |

---

### json-patch.js — RFC 6902 JSON Patch

Supported operations: `add`, `remove`, `replace`, `move`, `copy`, `test`.

```js
const { applyPatch, repairPatch, JsonPatchEngine } = require("./json-patch");

// In-memory
const { success, result, appliedOps } = applyPatch(doc, patches);

// Auto-repair common mistakes
const { repaired, patches: fixed, fixes } = repairPatch(rawPatches);

// File-level with backup
const engine = new JsonPatchEngine({ workspaceHash: "abc123" });
await engine.applyToFile("config.json", patches);
```

Auto-repair handles: missing leading `/` in paths, `set`→`replace`, `del`→`remove`, `insert`→`add`.

Backups stored in `~/.codein/swarm/{hash}/backups/`.

---

### swarm-manager.js — Orchestrator

The central coordinator. Extends `EventEmitter`.

**11 Core Methods:**

| Method                                      | Description                                     |
| ------------------------------------------- | ----------------------------------------------- |
| `swarmInit(config?)`                        | Initialize subsystems, start event broadcasting |
| `agentSpawn(type)`                          | Spawn a specialist agent                        |
| `agentList(filter?)`                        | List agents by type/status                      |
| `swarmStatus()`                             | Full system status snapshot                     |
| `agentMetrics(agentId?)`                    | Per-agent or aggregated metrics                 |
| `taskOrchestrate({goal, mode?, topology?})` | Decompose + execute a task                      |
| `taskStatus(taskId)`                        | Task progress with node states                  |
| `taskResults(taskId)`                       | Completed results + failures                    |
| `taskCancel(taskId)`                        | Cancel running task                             |
| `memoryUsage()`                             | Three-tier memory stats                         |
| `swarmShutdown()`                           | Graceful shutdown, close SSE                    |

**SSE Streaming:** `subscribe(res)` / `unsubscribe(res)` for real-time event push.

**Permission Proxy:** `getPendingPermissions()`, `respondToPermission(requestId, response)`.

---

## HTTP API

Base path: `/swarm` on port 43120.

| Method | Endpoint                        | Body                                                | Description                      |
| ------ | ------------------------------- | --------------------------------------------------- | -------------------------------- |
| POST   | `/swarm/init`                   | `{topology?, maxAgents?, concurrency?, gpuBudget?}` | Initialize swarm                 |
| POST   | `/swarm/shutdown`               | —                                                   | Graceful shutdown                |
| GET    | `/swarm/status`                 | —                                                   | Full status snapshot             |
| POST   | `/swarm/agents`                 | `{type}`                                            | Spawn agent                      |
| GET    | `/swarm/agents`                 | `?type=&status=`                                    | List agents                      |
| GET    | `/swarm/agents/metrics`         | `?agentId=`                                         | Agent metrics                    |
| POST   | `/swarm/tasks`                  | `{goal, mode?, topology?, context?}`                | Orchestrate task                 |
| GET    | `/swarm/tasks/:taskId`          | —                                                   | Task status                      |
| GET    | `/swarm/tasks/:taskId/results`  | —                                                   | Task results                     |
| POST   | `/swarm/tasks/:taskId/cancel`   | —                                                   | Cancel task                      |
| GET    | `/swarm/memory`                 | —                                                   | Memory usage                     |
| GET    | `/swarm/permissions`            | —                                                   | Pending permission requests      |
| POST   | `/swarm/permissions/:requestId` | `{response}`                                        | Respond to permission            |
| GET    | `/swarm/events`                 | —                                                   | SSE stream (`text/event-stream`) |
| GET    | `/swarm/events/log`             | `?limit=100`                                        | Event log                        |

---

## MCP Tools

11 tools registered via `createSwarmMcpTools(swarmManager)`:

`swarm_init`, `swarm_status`, `swarm_shutdown`, `agent_spawn`, `agent_list`,
`agent_metrics`, `task_orchestrate`, `task_status`, `task_results`, `task_cancel`,
`memory_usage`

All return `{content: [{type: "text", text: JSON_STRING}]}` or `{..., isError: true}`.

---

## GUI Components

`gui/src/components/SwarmPanel/` — React 18 + Redux Toolkit + Tailwind CSS.

| Component          | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `SwarmPanel`       | Main container, SSE connection, polling   |
| `SwarmHeader`      | Init/shutdown controls, topology selector |
| `SwarmAgents`      | Agent list with status badges             |
| `SwarmTaskView`    | Task submission + node progress           |
| `SwarmPermissions` | Approve/deny pending requests             |
| `SwarmTimeline`    | Scrollable event feed                     |
| `SwarmMemory`      | Three-tier usage bars                     |
| `SwarmGpu`         | Budget display with warning thresholds    |

State managed by `gui/src/redux/slices/swarmSlice.ts` with 11 async thunks.

---

## Security Model

- **Fail-closed**: All operations blocked by default except `FILE_READ`
- **GPU hard cap**: $100 absolute maximum, configurable default ($2)
- **Secret stripping**: All memory entries sanitized before storage
- **Audit trail**: Every permission decision logged with timestamp and reason
- **Session TTL**: GPU sessions expire after 30 min or 10 min idle
- **Input validation**: All configs, nodes, patches validated before processing

---

## Testing

```bash
cd packages/agent/test
node --test mas-types.test.cjs mas-memory.test.cjs mas-permissions.test.cjs \
  mas-json-patch.test.cjs mas-batch.test.cjs mas-routing.test.cjs
```

103 tests across 6 test files covering types, memory, permissions, JSON patch, batch operations, and agent routing/topology.
