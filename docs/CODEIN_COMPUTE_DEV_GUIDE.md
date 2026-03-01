# CodeIn Compute — Developer Guide

## Module Map

```
packages/agent/src/compute/
├── job-model.js        # Job, Step, Policy data models + validation
├── state-machine.js    # Job/Step lifecycle transitions + guards
├── job-store.js        # JSON file persistence (~/.codin/compute/jobs/)
├── event-stream.js     # SSE broadcaster for real-time UI updates
├── artifact-manager.js # File/report/diff storage per job
├── policy.js           # Fail-closed permission enforcement
├── sandbox.js          # Isolated workspace with path/command gating
├── escalation.js       # External API delegation with context redaction
├── planner.js          # LLM-based + heuristic task planning
├── executor.js         # Sequential step runner with retry + escalation
├── multilingual.js     # i18n adapter (STT → detect → translate → execute → translate → TTS)
├── orchestrator.js     # Top-level coordinator (composes all above)
├── index.js            # Barrel export
└── workflows/
    ├── fix-build.js    # Pre-built: diagnose + fix test/build failures
    ├── feature-spec.js # Pre-built: generate feature specification
    ├── research-code.js# Pre-built: web research → synthesise → code
    └── index.js        # Workflow registry
```

Routes: `packages/agent/src/routes/compute.js` (14 endpoints)
GUI: `gui/src/components/ComputePanel.tsx` + `ComputePanel.css`
Tests: `packages/agent/test/compute.test.cjs` (68 tests)

## Adding a New Workflow

1. Create `packages/agent/src/compute/workflows/my-workflow.js`:

```js
module.exports = {
  name: "my-workflow",
  title: "My Workflow",
  description: "What it does",
  goal: "Default goal text for the LLM",
  defaultPolicy: {
    allowNetwork: false,
    allowEscalation: false,
    allowFSWrite: true,
    allowRepoWrite: false,
    maxSteps: 10,
    maxDurationMs: 300000,
    maxCostUSD: 0,
  },
  planTemplate: {
    title: "My Pipeline",
    steps: [
      { description: "Step 1", agentName: "file-reader", tools: ["readFile"] },
      { description: "Step 2", agentName: "code-writer", tools: ["writeFile"] },
    ],
  },
};
```

2. Register in `workflows/index.js`:

```js
const myWorkflow = require("./my-workflow");
const WORKFLOWS = { ..., "my-workflow": myWorkflow };
```

The route handler auto-discovers workflows from the `WORKFLOWS` map.

## Adding a New Tool Category to Policy

Edit `policy.js`:

1. Add a Set of tool names for the category (similar to `networkTools`, `writeTools`).
2. Add a boolean policy field in `createDefaultPolicy()` in `job-model.js`.
3. Add the check in `checkToolPermission()`.
4. Add validation in `validatePolicy()`.
5. Add merge logic in `mergeWithDefaults()`.

## Data Flow

```
User Goal → [Multilingual.processInput] → English Goal
  → [Planner.plan] → Step[] (LLM or heuristic)
  → [Executor.executeJob] → for each step:
       → [PolicyEnforcer.check*] → allowed?
       → [Sandbox.executeTool] → tool result
       → [LLM inference] → step output + confidence
       → confidence < threshold? → [EscalationManager.escalate]
       → [ArtifactManager.store] → save outputs
  → [Multilingual.processOutput] → translated output
  → [EventStream.emit] → SSE to UI
  → [JobStore.save] → persist to disk
```

## State Machine

Job states:

```
queued → planning → running → completed
                  ↘ paused → running
                  ↘ waiting_user → running
         ↘ failed
         ↘ cancelled (from any non-terminal state)
```

Step states:

```
pending → running → completed
                  → failed → running (retry)
                  → escalated → completed / failed
        → skipped
```

## Testing

```bash
cd packages/agent
node --test test/compute.test.cjs
```

68 tests covering: job models, state machine transitions, policy enforcement (fail-closed, hard caps, tool gating, path traversal, command blocking, domain whitelisting, escalation budget), sandbox isolation, event stream, workflow definitions, and integration lifecycle scenarios.

To run the full agent test suite:

```bash
node --test test/
```

## Key Design Decisions

1. **CJS, not ESM** — matches the rest of the agent codebase (`require()`, `module.exports`)
2. **JSON file persistence** — consistent with `store.js` pattern, no database dependency
3. **Fail-closed security** — every permission is OFF unless explicitly granted; hard caps prevent abuse
4. **Local-first execution** — llama.cpp inference via model runtime, external APIs only on escalation
5. **Event-driven architecture** — `EventEmitter` + SSE for real-time UI updates without polling
6. **Stateless planner** — falls back to heuristic if LLM is unavailable, always produces a plan
7. **Immutable artifact storage** — artifacts are stored by ID with name sanitization and traversal prevention
