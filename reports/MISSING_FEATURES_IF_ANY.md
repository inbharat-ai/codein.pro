# MISSING FEATURES (AS OF MARCH 8, 2026)

This file only lists genuinely remaining gaps that still block an 8.5/10 release quality bar.

## 1. Vibe Transaction Safety (Blocking)

### Missing

- Strict JSON patch validation before write
- Atomic apply-or-rollback behavior for generated file changes
- Durable rollback ledger for recovery after partial failures

### Why It Matters

Without atomic patching, malformed generation output can corrupt workspaces.

### What Is Needed

- Patch schema validation + semantic guards
- Write-ahead transaction log
- Rollback command path integrated into vibe/apply

## 2. Run/Preview Process Supervision (Blocking)

### Missing

- Robust restart strategy for repeated process exits
- Stale process and port conflict detection/recovery
- Unified run/preview lifecycle state machine

### Why It Matters

Current behavior can fail hard during repeated start/stop cycles.

### What Is Needed

- Supervisor wrapper for dev server process
- Health probe + bounded restart policy
- Deterministic shutdown and orphan cleanup

## 3. End-to-End Integration Test Coverage (High)

### Missing

- Real integration tests across:
  - compute GPU lifecycle
  - vibe generate/apply/run/preview path
  - router decision + runtime execution path

### Why It Matters

Unit tests are good, but release confidence is limited without full path verification.

### What Is Needed

- Black-box API integration tests
- Failure-mode tests (provider timeout, malformed outputs, rollback)
- CI gating on integration suite

## 4. Public Positioning Alignment (High)

### Missing

- Full alignment between public claims and currently delivered UX/reliability

### Why It Matters

Trust and release quality perception depend on truthful positioning.

### What Is Needed

- Keep release channel private/internal alpha
- Promote to public beta only after the above blockers are closed

## Estimated Remaining Effort

- Vibe patch safety + rollback: 6-8h
- Run/preview supervision: 4-6h
- Integration testing matrix: 5-7h
- Positioning cleanup: 1-2h

**Total:** 16-23 hours
