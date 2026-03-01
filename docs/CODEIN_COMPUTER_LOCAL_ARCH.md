# CodeIn Computer (Local-Only) Architecture

## Scope

This document describes the local-only compute system that powers CodeIn Computer. It is an in-process, offline-first job runner that uses the existing compute pipeline and exposes a renderer-safe IPC surface. The system does not use external networks or third-party AI providers.

## Core components

- Compute pipeline: plan, execute, and stream events using the existing compute modules in packages/agent/src/compute
- Local-only client: compute-local package that enforces local-only policy and handles SSE events
- Electron main bridge: IPC handlers and subscription forwarding
- Renderer UI: ComputePanel uses IPC when available; HTTP fallback remains for dev

## Data locations

- Job store: ~/.codin/compute (existing compute JobStore)
- Artifacts: ~/.codin/compute/<jobId>/artifacts
- Logs: embedded in job JSON stored under ~/.codin/compute/jobs

## Local-only policy

The compute client force-enforces local-only defaults on every job submission:

- allowNetwork: false
- allowEscalation: false
- allowBrowser: false
- allowedDomains: []

Any user-provided policy overrides are merged, then local-only locks are applied so external network and external AI remain disabled.

## Event flow

1. Renderer submits a job through IPC.
2. Electron main forwards the request to the local compute client.
3. The client calls the agent compute endpoint and subscribes to SSE events.
4. Events are forwarded to the renderer via compute:event IPC messages.

## IPC surface

Main process registers the following IPC channels:

- compute:submitJob
- compute:listJobs
- compute:getJob
- compute:deleteJob
- compute:cancelJob
- compute:pauseJob
- compute:resumeJob
- compute:getStats
- compute:listLanguages
- compute:runWorkflow
- compute:subscribe
- compute:unsubscribe

Renderer uses window.codinAPI.compute to call these methods and to subscribe to job events.

## Integration points

- Agent compute endpoints: packages/agent/src/routes/compute.js
- Compute pipeline modules: packages/agent/src/compute/\*
- Electron IPC handlers: electron-app/src/main/ipc/IpcHandler.ts
- Electron preload API: electron-app/src/preload/preload.ts
- Renderer UI: gui/src/components/ComputePanel.tsx

## Known limitations

- Tool execution is limited to the compute pipeline surface; no external web or cloud providers are used.
- Browser automation requires explicit enablement and remains disabled by default in local-only mode.
