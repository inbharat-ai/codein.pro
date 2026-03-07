# PHASE 2 PROGRESS REPORT: Extension ↔ Agent Server Integration

**Date:** March 7, 2026  
**Status:** 50% COMPLETE — Architecture wired, testing needed

---

## WHAT WAS COMPLETED IN PHASE 2

### 1. ✅ Created Agent Server Client (Extension-Side)

**File:** `packages/extension/src/agent/AgentServerClient.ts`

Provides:

- Health check polling (every 5 seconds)
- Task submission: `submitTask(request: TaskRequest)`
- Task status polling: `getTaskStatus(taskId)`
- Results retrieval: `getTaskResults(taskId)`
- Task cancellation: `cancelTask(taskId)`
- Permission approval: `respondToPermission(requestId, approved)`
- SSE event streaming: `connectToEventStream()`
- Event listener registration via callbacks
- Connection status change notifications
- Automatic reconnection on disconnect

### 2. ✅ Created Logger Module (Extension-Side)

**File:** `packages/extension/src/agent/logger.ts`

Provides:

- VS Code output channel logging
- Methods: `info()`, `error()`, `warn()`, `debug()`
- `show()` to display output channel

### 3. ✅ Updated Extension Activation

**File:** `packages/extension/src/activation/activate.ts`

Changes:

- Initialize logger on activation
- Create AgentServerClient singleton
- Monitor connection status (show info message when connected)
- Listen for permission requests from agent server
  - Show VS Code dialog for approval/denial
  - Send response back to agent server
- Properly dispose client on extension deactivate

### 4. ✅ Created SwarmCommunicator (GUI-Side)

**File:** `gui/src/util/SwarmCommunicator.ts`

Provides:

- Direct HTTP calls to agent server (localhost:43120)
- Task submission with topology selection
- Task status polling and results retrieval
- Task cancellation
- Permission approval
- Real-time event streaming via SSE
- Event listener support

### 5. ✅ Created Task Complexity Classifier

**File:** `gui/src/util/taskClassifier.ts`

Provides:

- `classifyInputComplexity()` — analyzes user input for complexity
  - Keyword-based detection (refactor, debug, test, plan, etc.)
  - Length analysis
  - Pattern matching for:
    - Multi-step tasks (45% of keywords)
    - Planning/architecture (40% of keywords)
    - Iteration/loops (20% of keywords)
    - Refactoring (35% of keywords)
    - Testing (30% of keywords)
  - Returns: `{ isComplex, reason, confidence, suggestedTopology }`
- `shouldUseMultiAgentForMode()` — mode-based routing
- `getExplicitMultiAgentRequest()` — detects `/swarm`, `/agents`, `/mas` prefixes

### 6. ✅ Created Swarm Task Thunk

**File:** `gui/src/redux/thunks/streamSwarmTask.ts`

Provides:

- Entry point for multi-agent task execution
- Submits task to agent server
- Polls for task status updates every 1 second
- Streams events to UI in real-time
- Listens for SSE events simultaneously
- Handles task completion/failure
- Proper error handling and telemetry

### 7. ✅ Created Chat Router

**File:** `gui/src/redux/thunks/chatRouter.ts`

Provides:

- `routeUserInput()` — intelligent routing logic
  - Checks for explicit multi-agent requests (@swarm, @agents, @mas prefixes)
  - Runs complexity classifier
  - Routes complex tasks (confidence > 0.5) to swarmTask
  - Routes simple chat to streamNormalInput
  - Returns routing decision: "swarm" | "chat"

### 8. ✅ Integrated Router into Main Chat Flow

**File:** `gui/src/redux/thunks/streamResponse.ts`

Changes:

- Added import for `chatRouter`
- Added complexity routing logic AFTER content preparation
- Routes to `streamSwarmTask` or `streamNormalInput` based on classification
- Preserves legacy command flow compatibility

---

## CURRENT ARCHITECTURE FLOW

```
User Input (Extension Chat UI)
  ↓
streamResponseThunk (GUI)
  ├─ Resolve context providers
  ├─ Translate to English if needed
  ├─ Call routeUserInput()
  │  ├─ Check for explicit @swarm/@agents/@mas
  │  └─ Classify complexity
  │
  ├─ If Simple Chat:
  │  └─ streamNormalInput → Local LLM
  │     └─ Return results to UI
  │
  └─ If Complex Task:
     └─ streamSwarmTask
        ├─ SwarmCommunicator.submitTask()
        │  └─ HTTP POST to localhost:43120/swarm/tasks
        ├─ Poll /swarm/tasks/:taskId for status
        ├─ Listen to /swarm/events for real-time updates
        ├─ Get /swarm/tasks/:taskId/results when complete
        └─ Display results in UI

Permission Requests:
  Extension Agent Server → AgentServerClient (SSE event)
    └─ Listener detects permission_request event
       └─ Show VS Code dialog
       └─ Send approval/denial via /swarm/permissions/:requestId
       └─ Agent resumes

Events:
  Agent Server → SwarmCommunicator (SSE /swarm/events)
    └─ streamSwarmTask listens and streams to Redux
    └─ Redux updates UI in real-time
```

---

## WHAT STILL NEEDS TO BE DONE (PHASE 2 REMAINING)

### CRITICAL

- [ ] Add `/api/health` endpoint to agent server (for health checks)
- [ ] Verify SSE subscription works (test event streaming)
- [ ] Test permission request flow end-to-end
- [ ] Wire agents to actually use `callLLMWithTools()` (currently stubbed)
- [ ] Verify task submission and status polling work correctly
- [ ] Test swarm event streaming to UI

### HIGH PRIORITY

- [ ] Add UI indicator in extension showing "Agent Server: connected/disconnected"
- [ ] Add SwarmPanel mode selector for topology (mesh, hierarchical, ring, star)
- [ ] Display task progress in UI (nodes completed, agents active, timeline)
- [ ] Add permission request dialog in SwarmPanel
- [ ] Clear documentation for @swarm/@agents prefixes

### MEDIUM PRIORITY

- [ ] Error recovery if agent server crashes
- [ ] Timeout handling if task hangs
- [ ] Agent logger integration (stream agent logs to UI)
- [ ] Cancel task button in UI
- [ ] Task history/replay

---

## TESTING CHECKLIST (PHASE 2)

When testing Phase 2, verify:

- [ ] Extension starts agent server on port 43120
- [ ] Agent server exposes /swarm/\* endpoints
- [ ] Extension can connect to agent server (health check succeeds)
- [ ] GUI can submit a task to /swarm/tasks
- [ ] Task appears in swarm system (check /swarm/tasks/:taskId)
- [ ] SSE event stream works (/swarm/events)
- [ ] Events appear in GUI in real-time
- [ ] Permission requests appear in VS Code dialog
- [ ] Approving/denying permission sends response to agent server
- [ ] Agent server resumes task after permission approval
- [ ] Task completion returns results to GUI
- [ ] UI displays results properly formatted
- [ ] Simple chat still works (doesn't go to swarm)
- [ ] Complex keywords trigger swarm routing
- [ ] @swarm prefix forces swarm routing
- [ ] All 52 MAS tests pass

---

## INTEGRATION POINTS STATUS

| Component                         | Location                                            | Status         | Notes                                    |
| --------------------------------- | --------------------------------------------------- | -------------- | ---------------------------------------- |
| **Extension Agent Client**        | `packages/extension/src/agent/AgentServerClient.ts` | ✅ Implemented | Ready for testing                        |
| **Extension Logger**              | `packages/extension/src/agent/logger.ts`            | ✅ Implemented | Ready for use                            |
| **Extension Activation**          | `packages/extension/src/activation/activate.ts`     | ✅ Modified    | Client initialized, listeners registered |
| **GUI Swarm Communicator**        | `gui/src/util/SwarmCommunicator.ts`                 | ✅ Implemented | Direct HTTP to agent server              |
| **Task Classifier**               | `gui/src/util/taskClassifier.ts`                    | ✅ Implemented | Keyword-based routing logic              |
| **Swarm Task Thunk**              | `gui/src/redux/thunks/streamSwarmTask.ts`           | ✅ Implemented | Task submission and polling              |
| **Chat Router**                   | `gui/src/redux/thunks/chatRouter.ts`                | ✅ Implemented | Routing decision logic                   |
| **streamResponse Integration**    | `gui/src/redux/thunks/streamResponse.ts`            | ✅ Modified    | Router wired into flow                   |
| **Agent Server Health**           | `/api/health`                                       | ❌ Missing     | TODO: Add to agent server                |
| **Agent Server /swarm/\* Routes** | `packages/agent/src/routes/swarm.js`                | ✅ Exists      | Already implemented                      |
| **MAS System**                    | `packages/agent/src/mas/`                           | ✅ Exists      | Core orchestration ready                 |
| **Agent System**                  | `packages/agent/src/mas/agents/`                    | ✅ Exists      | But agents need tool-use wiring          |
| **Permission System**             | `packages/agent/src/mas/permissions.js`             | ✅ Exists      | Ready to request approval                |

---

## DECISIONS MADE

### 1. Direct HTTP vs. IDE Messenger

**Decision:** GUI makes direct HTTP calls to agent server

**Rationale:**

- Simpler architecture (no message wrapper protocol needed)
- Lower latency (direct network call)
- Easier debugging (standard HTTP)
- Works from webview context without special bridges

**Trade-off:** Requires agent server on predictable port (43120)

### 2. Keyword-Based Complexity Detection

**Decision:** Simple keyword/length heuristics, not ML model

**Rationale:**

- No ML dependency
- Deterministic and testable
- Fast (O(1) checking)
- User can override with @swarm prefix

**Trade-off:** May misclassify some inputs (acceptable with 0.5 confidence threshold)

### 3. Polling vs. WebSocket for Task Status

**Decision:** Polling every 1 second + SSE for events

**Rationale:**

- Polling is simple and reliable
- SSE for real-time event stream
- Redundant delivery (better reliability)
- Reduces need for bidirectional connection

**Trade-off:** Slightly higher latency (1s max)

### 4. Separate Clients (AgentServerClient vs SwarmCommunicator)

**Decision:** Two separate client implementations

**Rationale:**

- Extension-side uses different timing/scope
- GUI-side uses different transport (webview context)
- Each can be optimized independently
- Clear separation of concerns

**Trade-off:** Slight code duplication (acceptable)

---

## NEXT IMMEDIATE STEPS

1. **Add health check endpoint** to agent server

   - File: `packages/agent/src/routes/swarm.js`
   - Add: `GET /api/health` endpoint
   - Return: `{ status: "ok", version: "X.X.X" }`

2. **Wire agents to use tool-use loop**

   - File: `packages/agent/src/mas/agents/base-agent.js`
   - Modify: Make `execute()` call `this.callLLMWithTools()` instead of `this.callLLM()`
   - Impact: Agents can now call MCP tools

3. **Verify integration end-to-end**

   - Start extension with agent server
   - Submit simple task via chat (should use local LLM)
   - Submit complex task (refactor, debug) (should route to swarm)
   - Verify task appears in swarm system
   - Check SSE events stream to UI
   - Verify results display

4. **Continue with PHASE 3** (GPU Orchestration) only after PHASE 2 is verified working
