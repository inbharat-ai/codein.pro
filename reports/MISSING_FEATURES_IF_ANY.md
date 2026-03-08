# MISSING FEATURES (AS OF MARCH 8, 2026)

This file only lists genuinely remaining gaps that still block an 8.5/10 release quality bar.

## 1. Vibe Profile-Aware Policy Hardening (Blocking)

### Missing

- Profile-aware semantic validation for allowed file operations and patch bounds
- Durable rollback ledger for recovery after process interruption

### Why It Matters

Transactional rollback, RFC6902 op validation, and baseline semantic policy are now implemented. Remaining gap is profile-aware policy controls to reduce over/under-blocking by stack and phase.

### What Is Needed

- Stack/profile-aware policy guards (Next.js, API-only, docs-only, etc.)
- Write-ahead transaction log
- Rollback command path integrated into vibe/apply with recovery replay

## 2. Run/Preview Lifecycle Finalization (Blocking)

### Missing

- Rich lifecycle state transitions across startup/restart/failure states
- Stale process and port conflict detection/recovery
- Unified run/preview lifecycle state machine

### Why It Matters

Current behavior improved with restart retry/backoff and stale-process supervision, but port conflict diagnostics and lifecycle transitions are still incomplete.

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

- Vibe profile-aware policy + rollback ledger: 2-4h
- Run/preview lifecycle finalization: 2-4h
- Integration testing matrix: 5-7h
- Positioning cleanup: 1-2h

**Total:** 10-17 hours
