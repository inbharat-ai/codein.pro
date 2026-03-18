---
name: debug-helper
display_name: Debug Helper
description: Systematic debugging methodology for Node.js, React, and Electron applications — from reproduction to verified fix
category: debugging
version: 1.0.0
author: inbharatai
tags:
  - debugging
  - troubleshooting
  - node
  - react
  - electron
---

# Debug Helper

Apply a structured, systematic approach to diagnosing and fixing bugs. Never guess — follow the evidence.

## When to Use

- A bug report or error has been filed and needs investigation
- A test is failing and the root cause is unclear
- An intermittent issue needs systematic isolation
- Performance has degraded and the bottleneck is unknown

## When NOT to Use

- The fix is already obvious from the error message (just fix it)
- The issue is a known limitation documented elsewhere
- The problem is purely a styling/CSS issue (use browser DevTools directly)

## The 5-Step Methodology

### Step 1: Reproduce

Before anything else, confirm you can trigger the bug reliably.

- **Get exact reproduction steps** from the reporter. Environment, input data, sequence of actions.
- **Reproduce locally** in the same environment (Node version, OS, browser). If Electron, check both main and renderer processes.
- **If intermittent**: identify the frequency, look for timing dependencies, try adding artificial delays or running in a tight loop.
- **If unreproducible**: check environment differences (env vars, feature flags, data state), ask for logs, check if it only happens under load.

Write down the minimal reproduction steps before proceeding.

### Step 2: Isolate

Narrow the scope to the smallest possible area.

- **Binary search debugging**: Comment out or bypass half the code path. Does the bug still occur? Keep halving until you find the exact line/module responsible.
- **Input minimization**: Reduce the input data to the smallest case that still triggers the bug.
- **Dependency elimination**: Replace external calls (API, DB, file system) with hardcoded responses. If the bug disappears, the issue is in the integration.
- **Process isolation** (Electron): Determine if the bug is in main process, renderer process, or IPC between them. Add `console.log` markers on both sides of IPC calls.

### Step 3: Diagnose

Understand WHY the bug happens, not just WHERE.

**Stack Trace Interpretation — Node.js:**

- Read bottom-to-top for the call chain, top-to-bottom for the error origin
- `at Object.<anonymous>` = top-level module code
- `at processTicksAndRejections` = unhandled promise rejection (check async chains)
- `at TCP.onStreamRead` = network/stream error (check connection handling)
- Missing frames after `async` = the error was thrown in an async callback; look for missing `await`

**Stack Trace Interpretation — React:**

- Component stack shows the render tree path to the error
- `The above error occurred in the <ComponentName> component` = error during render
- `Cannot update a component while rendering a different component` = state update in render body (move to useEffect)
- `Maximum update depth exceeded` = infinite re-render loop (check useEffect deps)

**Common Bug Patterns:**

| Pattern             | Symptom                                | Root Cause                                                                       |
| ------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| Race condition      | Works sometimes, fails under load      | Two async operations sharing mutable state without synchronization               |
| Memory leak         | Increasing RSS over time, eventual OOM | Missing cleanup: intervals, listeners, closures over large objects               |
| Event loop blocking | UI freeze, slow API responses          | Synchronous CPU work on main thread (JSON.parse of huge payloads, crypto, regex) |
| Unhandled rejection | Silent failure, inconsistent state     | Missing `await`, missing `.catch()`, or error in `.then()` callback              |
| Stale closure       | Component shows outdated data          | useEffect/useCallback captures old state; missing dependency in deps array       |
| Double render       | Side effect fires twice                | React.StrictMode intentional double-invoke; move side effects out of render      |

### Step 4: Fix

Apply the minimal, targeted fix.

- Fix the root cause, not the symptom. If a null check hides the real problem, find why the value is null.
- Write the fix in the smallest possible diff. Do not refactor unrelated code in the same change.
- Add a code comment explaining WHY the fix is needed if the reason is non-obvious.
- Consider edge cases: will this fix hold under concurrent access, empty input, network failure?

### Step 5: Verify

Confirm the fix works and doesn't break anything.

- Re-run the exact reproduction steps — the bug must not occur.
- Run the full test suite. If any test fails, the fix introduced a regression.
- Add a regression test that would have caught this bug. The test should fail without the fix and pass with it.
- If the bug was intermittent, run the reproduction in a loop (at least 50 iterations) to confirm stability.

## Logging Strategy

When adding debug logging, use structured logs with correlation IDs:

```javascript
// Good: structured, traceable
logger.debug("agent:execute", {
  correlationId: req.id,
  action: "tool_call",
  tool: toolName,
  inputSize: JSON.stringify(input).length,
  durationMs: Date.now() - start,
});

// Bad: unstructured, untraceable
console.log("calling tool", toolName);
```

Always clean up debug logging before committing the fix. Convert useful debug logs to permanent trace-level logs if they would help future debugging.

## Electron-Specific Debugging

- **Main process crashes**: Check `process.on('uncaughtException')` and Electron crash reports in `app.getPath('crashDumps')`
- **Renderer white screen**: Check DevTools console (Cmd+Opt+I / Ctrl+Shift+I); look for CSP violations, failed script loads
- **IPC issues**: Log on both `ipcMain.handle` and `ipcRenderer.invoke` sides; check that channel names match exactly; verify serialization (IPC uses structured clone, not JSON)
- **Native module crashes**: Rebuild with `electron-rebuild`; check Node.js ABI version matches Electron's
