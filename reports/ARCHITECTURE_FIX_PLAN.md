# ARCHITECTURE FIX PLAN

**Date:** March 7, 2026  
**Goal:** Transform Coding from 6.2/10 → 8.5/10 by fixing foundation and integrating all systems  
**Status:** In Progress - PHASE 1 COMPLETE

---

## EXECUTIVE SUMMARY

The Coding platform has a **sound core** but is **split into two incompatible halves**:

- **Half 1 (Extension):** Excellent VS Code chat UI, fully functional alone, ZERO awareness of MAS
- **Half 2 (Agent Server):** Sophisticated MAS orchestration, ZERO integration with extension UI

**Critical Finding:** Permission system, GPU tracking, and model router are **architecturally designed but functionally fake** — they guard against operations that are never actually attempted.

**The Fix:** Rewire these systems to be honest (remove fakes), then integrate extension ↔ agent server end-to-end.

---

## PHASE 1 FINDINGS: WHAT'S BROKEN

### 1.1 SPLIT-BRAIN ARCHITECTURE (CRITICAL)

**The Problem:**

```
Current:
┌─────────────────────────────────┐
│    VS Code Extension (GUI)      │
│  - Chat input                   │
│  - Tool calling                 │
│  - Streaming results            │
│  - Code editing UI              │
└─────────────────┬───────────────┘
                  │
                  ├─ llm/streamChat
                  │  (hardcoded chat
                  │   pipeline, standalone)
                  │
                  x BROKEN HERE x

┌─────────────────────────────────┐
│   Agent Server (Port 43120)     │
│  - MAS orchestration            │
│  - Swarm topologies             │
│  - Permission system            │
│  - Task graphs                  │
└─────────────────────────────────┘
                  │
                  └─ /swarm REST API
                     (unreachable)
```

**Impact:**

- Extension never calls agent server APIs
- MAS features invisible to users
- Two incompatible data flows
- Duplicate code (context gathering, tool calling)
- Confusion about single-agent vs multi-agent capability

**Evidence:**

- `packages/extension/src/llm/streamChat.ts` — Hardcoded chat loop, doesn't reference MAS
- `packages/agent/src/routes/swarm.js` — REST endpoints exist but never called by extension
- `gui/src/App.tsx` — SwarmPanel mounted but unreachable in UI
- `packages/extension/src/commands.ts` — `continue.openSwarmPanel` exists but no command palette entry

### 1.2 GPU ORCHESTRATION IS ENTIRELY FAKE (HIGH)

**The Problem:**

```
Permission System -> GPU Budget Check -> ✓ Approved/Denied
                                         │
                                         x MISSING LAYER x

GPU Provider Layer -> RunPod API -> ✗ Never Called
GPU Provider Layer -> AWS Batch  -> ✗ Never Called
GPU Provider Layer -> GCP        -> ✗ Never Called
```

**What Exists (Fake):**

- `packages/agent/src/mas/permissions.js` L124-134 — GPU budget tracking logic
- GPU spend approval/denial in permission decisions
- Budget cap enforcement ($2-$100)
- TTL/idle shutdown configuration

**What's Missing (Real Implementation):**

- `packages/agent/src/gpu-orchestration/` — **ENTIRE DIRECTORY EMPTY**
- RunPod API client (create session, poll status, stop)
- AWS Batch integration
- GCP Compute Engine integration
- Job submission and monitoring
- Cost API consumption
- VRAM allocation

**Impact:**

- Users think GPU is available (permissions allow it)
- Feature fails at runtime (no provider backend)
- Trust break: "You said this works"

**Evidence:**

```bash
# All GPU orchestration code is fake:
- packages/agent/src/gpu-orchestration/  (empty directory)
- No RunPod imports
- No AWS SDK calls
- No job submission anywhere
- Permission to spend GPU is checked but never actually spent
```

### 1.3 MODEL ROUTER FEEDBACK LOOP STUBBED (HIGH)

**The Problem:**

```
Model Router -> Classify Task -> Score Models -> Select Model
                                                  │
                                                  └─ Use Model

After Task Completes:
recordPerformance() -> exists but NEVER CALLED
Learning disabled  -> feedback loop is dead code
```

**What Exists:**

- Task classification by category (reasoning, coding, debug, etc.)
- Model scoring by quality/cost/latency metrics
- Performance data structure and storage
- ModelRouter in `packages/agent/src/model-runtime/router.js`

**What's Stubbed:**

- Performance feedback never triggered after task completion
- Model scores never updated based on actual results
- Learning data accumulates but is never consumed
- `recordPerformance()` is dead code

**Impact:**

- Router selects models optimally once (on first run)
- Never learns or improves
- Feature appears implemented but doesn't work

**Evidence:**

```javascript
// Line 207-300 in router.js exists but is never called:
PerformanceTracker.record(taskId, {
  model,
  latency,
  costValue,
  quality,
});
// Nothing triggers this after task completion
```

### 1.4 VIBE CODING IS COMPLETELY MISSING (HIGH)

**The Spec Says:**

- Upload image
- Analyze into UI spec
- Generate code
- Run and preview

**What Exists:**

- Zero references in codebase
- No image upload handler
- No vision model integration
- No UI spec analyzer
- No component scaffold generator

**Impact:**

- Feature promised but doesn't exist
- Users expect "upload image → get app running"
- Major differentiation feature is missing

### 1.5 AGENTS NEVER USE MCP TOOLS (HIGH)

**The Problem:**

```
Agent -> callLLM(prompt) -> Gets tool suggestion
                            │
                            └─ "use_mcp_tool"
                                │
                                x NEVER EXECUTED x
```

**What Exists:**

- 10 agent types in `packages/agent/src/mas/agents/`
- `callLLMWithTools()` method added but not called
- MCP tool registry available

**What's Missing:**

- Agents never invoke `callLLMWithTools()`
- All agents do single LLM call, ignore tool suggestions
- Tool-use loop doesn't exist in real execution

**Impact:**

- Agents can't search files, read docs, call external APIs
- Multi-step tasks fail
- Tool-use capability is dead

**Evidence:**

- `packages/agent/src/mas/agents/base-agent.js` — `callLLMWithTools()` defined but unreferenced
- No agent calls `this.callLLMWithTools()` in their `execute()` methods

### 1.6 I18N BACKENDS NOT DEPLOYED (MEDIUM)

**The Problem:**

- AI4Bharat NMT integration expects port 43121
- Python microservice is not bundled or deployed
- Translation falls back to LLM (degraded quality)
- Voice TTS/STT requires separate installations

**Impact:**

- Multilingual feature is partial (LLM-only translation)
- No native language NMT quality
- Voice features require manual setup

### 1.7 COMPUTE JOBS DON'T INSTALL DEPENDENCIES (MEDIUM)

**The Problem:**

- Agent tries to run `npm start` or `python manage.py`
- Project dependencies not installed first
- Jobs fail immediately

**What's Missing:**

- Pre-flight dependency check
- Auto-install npm/pip packages
- Environment setup script

### 1.8 NO EXPONENTIAL BACKOFF / RETRY LOGIC (MEDIUM)

**The Problem:**

- Provider API fails → retries immediately
- No exponential backoff delays
- Services can be hammered with requests
- Quota exhaustion possible

### 1.9 EXTENSION UI ONLY IN ENGLISH (MEDIUM)

**The Problem:**

- `.nls` files don't exist for VS Code localization
- Extension UI hardcoded English
- Backend i18n works but GUI doesn't use it
- Only English speakers can use extension

---

## PHASE 2 PLAN: FIX EXTENSION ↔ AGENT SERVER INTEGRATION

### 2.1 Define Control Flow

```
User Input (Extension UI)
  ↓
Extension captures intent, context
  ↓
Extension → POST /api/task (Agent Server)
  ↓
Agent Server: SessionManager creates session
  ↓
Agent Server: PlannnerAgent decomposes → TaskGraph
  ↓
Agent Server: Executes nodes through topologies
  ↓
Agent Server → SSE /api/events (stream back to Extension)
  ↓
Extension receives events, displays progress
  ↓
Agents request permissions via Extension UI
  ↓
User approves/denies
  ↓
Extension → POST /api/decision
  ↓
Agent resumes with decision
  ↓
Task completes, results sent to Extension
  ↓
Extension displays results in UI
```

### 2.2 Implementation Checklist

#### Extension → Agent Server API Bridge

- [ ] Replace hardcoded `streamChat` with hybrid model detection
- [ ] If simple chat → use extension LLM (fast, offline)
- [ ] If complex task → route to Agent Server via `/api/task`
- [ ] Implement SSE event listener for task progress
- [ ] Display task graph visualization in SwarmPanel
- [ ] Implement permission request UI
- [ ] Wire approval back to agent server

#### Agent Server → Extension API

- [ ] Implement `/api/task` endpoint with sessionId management
- [ ] Implement `/api/events` SSE endpoint streaming back to extension
- [ ] Implement `/api/decision` endpoint for permission approval
- [ ] Add health check `/api/health`
- [ ] Add session state endpoint `/api/session/:id`

#### Bidirectional Connection

- [ ] Extension has "Connect to Agent Server" button
- [ ] Show connection status (connected/disconnected)
- [ ] Auto-retry on disconnect
- [ ] Graceful fallback if agent server unavailable
- [ ] Clear UI that shows current mode (local chat vs multi-agent)

---

## PHASE 3 PLAN: IMPLEMENT REAL RUNPOD GPU PROVIDER

### 3.1 Runpod Integration Checklist

**API Key Management:**

- [ ] Add secure secret storage (VS Code memento or agent server vault)
- [ ] Never log API keys
- [ ] Encrypt at rest

**Session Lifecycle:**

- [ ] Create endpoint in `gpu-orchestration/runpod-provider.js`
- [ ] Call Runpod API: POST /api/v1/pod/run_sync
- [ ] Pass: podFindAndDeployOnDemandInput with VRAM/GPU type
- [ ] Receive: machineId, status, cost/hour
- [ ] Return session ID, endpoint, cost estimate

**Monitoring:**

- [ ] Poll Runpod API: GET /api/v1/pod/:podId
- [ ] Track status: running, stopped, failed
- [ ] Collect logs via API
- [ ] Track cost accumulation vs budget

**Stop/Cleanup:**

- [ ] Implement graceful shutdown before budget cap
- [ ] Call Runpod API: POST /api/v1/pod/:podId/stop
- [ ] Verify stopped status
- [ ] Generate final cost report

**UI in Compute Panel:**

- [ ] Add "Connect Runpod" button (API key input)
- [ ] Show available GPU types with price/VRAM info
- [ ] Button to provision session
- [ ] Real-time cost display
- [ ] Logs viewer
- [ ] Stop button

### 3.2 Code Changes Required

- [ ] Create `packages/agent/src/gpu-orchestration/runpod-provider.js`
- [ ] Update `packages/agent/src/mas/permissions.js` to actually call Runpod
- [ ] Add routes in `packages/agent/src/routes/gpu.js`
- [ ] Update GUI with Compute panel using new API

---

## PHASE 4 PLAN: REPLACE FAKE MODEL ROUTER WITH DETERMINISTIC ROUTING

### 4.1 Remove Fake Adaptivity

- [ ] Delete `PerformanceTracker.record()` calls (dead code)
- [ ] Delete fine-tune data collection (no consumer)
- [ ] Remove adaptive learning infrastructure
- [ ] Keep deterministic task classification

### 4.2 Implement Honest Route Rules

```
If task is:
  - Math/reasoning → GPT-4o (best reasoning)
  - Code generation → Claude 3.5 (best code)
  - Code editing → GPT-4o (precise edits)
  - Debugging → Claude 3.5 (explanations)
  - Translation → Gemini (multilingual)
  - Vision → Claude 4 Vision or GPT-4V

If provider unavailable:
  - Try next in priority list
  - Fall back to local model if available
```

### 4.3 Code Changes

- [ ] Simplify `packages/agent/src/model-runtime/router.js`
- [ ] Remove learning infrastructure
- [ ] Hardcode determinstic rules
- [ ] Test each rule with real tasks
- [ ] Document routing rules clearly
- [ ] Make it deterministic and predictable

---

## PHASE 5 PLAN: IMPLEMENT REAL VIBE CODING

### 5.1 Vibe Coding Pipeline

```
1. User uploads image (*.png, *.jpg)
2. System extracts UI structure (Claude 4 Vision)
3. User provides multilingual prompt ("Build a todo app")
4. System combines: vision + prompt + language → UI spec (JSON)
5. Generate React/Next.js scaffold
6. Generate components with proper structure
7. Apply via JSON patches to project
8. Run with npm start
9. Open preview in browser
```

### 5.2 Implementation Checklist

**Image Analysis:**

- [ ] Accept image upload via `/api/vibe/analyze`
- [ ] Call Claude 4 Vision API with image
- [ ] Extract: layout, components, colors, typography
- [ ] Return UI spec in structured JSON

**Code Generation:**

- [ ] Generate Next.js + Tailwind scaffold
- [ ] Create proper file structure
- [ ] Store text in i18n files (not hardcoded)
- [ ] Use strict JSON patches for application

**Run & Preview:**

- [ ] Detect project type (Next.js, React, etc.)
- [ ] Auto-install dependencies if needed
- [ ] Start dev server
- [ ] Open browser to localhost:3000
- [ ] Stream logs back to UI

### 5.3 Code Changes

- [ ] Create `packages/agent/src/vibe-coding/` directory
- [ ] Implement image analyzer
- [ ] Implement scaffold generator
- [ ] Implement file applier (use JSON patches)
- [ ] Add routes in agent server
- [ ] Update extension UI with Vibe panel

---

## PHASE 6 PLAN: HARDEN RELIABILITY

### 6.1 Exponential Backoff

- [ ] Add utility: `async function retryWithBackoff(fn, maxRetries, initialDelay)`
- [ ] Use: `delay = Math.min(maxDelay, initialDelay * (2 ** attemptCount))`
- [ ] Apply to all provider API calls
- [ ] Add timeout per attempt

### 6.2 Timeout Handling

- [ ] Add `Promise.race([task, timeoutPromise])`
- [ ] Default timeout: 30s per LLM call, 60s per tool execution
- [ ] Configurable per node
- [ ] Graceful cancellation instead of kill

### 6.3 Error Recovery

- [ ] Add corrupted state detection (invalid JSON, broken patches)
- [ ] Rollback to last known good state
- [ ] Log error for debugging
- [ ] Notify user with recovery options

### 6.4 Run/Preview Stability

- [ ] Health check on dev server before exposing
- [ ] Retry dev server start if fails
- [ ] Kill orphaned processes on restart
- [ ] Stream real-time logs, capture errors
- [ ] Auto-stop on error (don't leave hanging process)

---

## PHASE 7 PLAN: DELETE DEAD CODE + SIMPLIFY

### 7.1 Identification

**To Remove:**

- [ ] `_dead/` directory (24 abandoned files)
- [ ] Fine-tune data collection infrastructure
- [ ] Unused ModelRuntime implementations
- [ ] Ring + Star topology implementations (keep Mesh + Hierarchical only)
- [ ] Mock GPU providers
- [ ] Placeholder service stubs

**To Keep:**

- [ ] Core MAS (SwarmManager, all agents)
- [ ] Permission gate
- [ ] Memory system
- [ ] LLM providers
- [ ] Code patching
- [ ] Observability

### 7.2 Code Changes

- [ ] Delete identified files
- [ ] Verify no broken imports
- [ ] Update documentation
- [ ] Simplify configuration

---

## PHASE 8 PLAN: PREP FOR FUTURE SCALE

### 8.1 Session Isolation

- [ ] Each user session is fully isolated
- [ ] No cross-session data leakage
- [ ] Separate memory stores per session
- [ ] Separate workspace per session

### 8.2 Workspace Isolation

- [ ] Each workspace is independent
- [ ] File edits don't affect other workspaces
- [ ] Agent context is workspace-specific
- [ ] Permissions tracked per workspace

### 8.3 Architecture Ready for Multi-Session

- [ ] SessionManager in place (session registry)
- [ ] State stored separately per session
- [ ] Easy to add database backend later
- [ ] Easy to add multi-worker later (just queue onto RabbitMQ or similar)

---

## SUCCESS CRITERIA

When PHASE 1-8 complete, the system must:

✅ Extension and Agent Server communicate bidirectionally
✅ MAS features are accessible from extension UI
✅ GPU orchestration is real (not fake)
✅ Model routing is deterministic and honest
✅ Vibe coding works end-to-end
✅ Reliability is world-class (backoff, timeout, recovery)
✅ Code is clean (no dead code, no fakes)
✅ Architecture is ready for future scaling
✅ All 103 tests still pass
✅ System scores 8.5+/10

---

## ESTIMATED EFFORT

| Phase                  | Hours         | Risk               | Notes                     |
| ---------------------- | ------------- | ------------------ | ------------------------- |
| PHASE 1 (Inspection)   | 4             | Low                | ✅ COMPLETE               |
| PHASE 2 (Integration)  | 40            | High               | Critical path             |
| PHASE 3 (GPU Provider) | 30            | Medium             | Runpod API integration    |
| PHASE 4 (Model Router) | 8             | Low                | Simplification work       |
| PHASE 5 (Vibe Coding)  | 50            | Medium             | Vision + code gen         |
| PHASE 6 (Reliability)  | 20            | Low                | Utility functions + tests |
| PHASE 7 (Dead Code)    | 15            | Low                | Cleanup + verification    |
| PHASE 8 (Scale Prep)   | 12            | Low                | Architecture adjustments  |
| **TOTAL**              | **179 hours** | **Medium Overall** | ~4-5 weeks full-time      |

---

## NEXT STEP

Begin **PHASE 2: Fix Extension ↔ Agent Server Integration** immediately.
