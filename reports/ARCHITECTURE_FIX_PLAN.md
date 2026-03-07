# ARCHITECTURE FIX PLAN

**Date:** March 8, 2026  
**Objective:** Move CodIn from audit-quality 6.2/10 toward engineering-quality 8.5/10  
**Current Status:** Foundation fixed, GPU control plane wired, reliability partially hardened

## 1. What Was Broken

- GPU orchestration existed as a provider implementation but was not exposed through core compute APIs.
- Compute pipeline lacked a secure session-level GPU control surface.
- Reliability around remote provider calls lacked bounded exponential backoff.
- Reports across `/reports` were inconsistent with actual code state.

## 2. What Was Fake / Misleading

- Prior project status text claimed some integrations as complete while code paths were not reachable from runtime APIs.
- Landing/report-level positioning implied parity that did not match delivered end-to-end behavior.

## 3. What Was Removed

- Placeholder execution response path in compute executor was removed earlier and replaced with real failure/fallback behavior.
- Wildcard SSE CORS behavior was removed earlier and replaced with restricted localhost-origin handling.

## 4. What Was Rewired (Implemented)

### 4.1 Real GPU Session Manager

Added `packages/agent/src/compute/gpu-session-manager.js` with:

- Session lifecycle per user
- Secure API key storage via `Keyring`
- Provider lifecycle management
- Job tracking and status surface
- Pod logs/status/stop support

### 4.2 Compute Orchestrator GPU Integration

Updated `packages/agent/src/compute/orchestrator.js`:

- Instantiates `GpuSessionManager`
- Exposes GPU orchestration methods:
  - `connectGpu`
  - `listGpuTypes`
  - `createGpuPod`
  - `submitGpuJob`
  - `getGpuJobStatus`
  - `getGpuLogs`
  - `getGpuStatus`
  - `stopGpu`
- Includes GPU session count in `getStats()`

### 4.3 Compute API Endpoints for Runpod

Updated `packages/agent/src/routes/compute.js` with real endpoints:

- `POST /compute/gpu/connect`
- `GET /compute/gpu/types`
- `POST /compute/gpu/pod`
- `POST /compute/gpu/jobs`
- `GET /compute/gpu/jobs/:jobId`
- `GET /compute/gpu/logs`
- `GET /compute/gpu/status`
- `POST /compute/gpu/stop`

### 4.4 Reliability Hardening for GPU Provider

Updated `packages/agent/src/gpu-orchestration/runpod-provider.js`:

- Added `_withRetry()` bounded exponential backoff
- Wrapped network-sensitive operations:
  - `listGpuTypes`
  - `createPod`
  - `submitJob`
  - `getJobStatus`
  - `getPodLogs`
  - `stopPod`

## 5. What Is Now Actually Working

- Extension-agent path remains functional (health + task submission + SSE).
- GPU provider is reachable through core compute APIs (not just internal classes).
- GPU key handling is persisted securely through keyring-backed storage.
- GPU lifecycle (connect, list, create pod, submit, poll, logs, stop) is callable via REST.
- Retry/backoff reduces transient remote API failure fragility.

## 6. Remaining Gaps to Reach 8.5/10

1. Complete end-to-end vibe flow hardening:

- strict patch validation
- rollback-aware file application
- deterministic scaffold generation fallback paths

2. Run/preview resilience:

- supervised process restart strategy
- structured process health and stale process cleanup

3. Model router production hardening:

- policy-driven local/cloud privacy gate
- explicit vision/coder/reasoner route contracts surfaced in API docs

4. Dead code and stale report cleanup:

- remove contradictory historical claims
- collapse duplicate architecture narratives

## 7. Execution Order (Next)

1. Vibe strict patch + rollback contract
2. Run/preview supervisor stabilization
3. Router policy gate + observability exposure
4. Dead code/report consolidation
5. Full integration test pass and release score re-evaluation
