# Electron Packaging Discovery (CodeIn)

## Verified Facts

- Packager: `electron-builder`
- Source of truth: `electron-app/package.json`
- Build config key: `build`
- Runtime resources mechanism: `build.extraResources`

## Current Observed Configuration

- Existing llama resource mapping:
  - from: `../binary/llama.cpp/build/bin`
  - to: `bin`
- Existing bundled backend mapping:
  - from: `../packages/agent`
  - to: `agent`

## Gaps Identified

1. Current llama mapping depends on local build output folder shape.
2. No explicit cross-platform prebuilt runtime asset folder under electron app.
3. No explicit runtime handoff contract from Electron -> Agent via environment (`LLAMA_PATH`).

## Implementation Direction (Additive)

1. Add platform-pinned prebuilt runtime assets under `electron-app/assets/llama/{win32,darwin,linux}`.
2. Update `extraResources` to include this folder as `llama` in packaged resources.
3. At runtime, pass executable path override to agent using env var `LLAMA_PATH`.
4. Keep existing runtime bootstrap fallback behavior to avoid regressions.

## Verification Checklist

- [ ] `npm run dist` includes `resources/llama/**`
- [ ] Agent receives `LLAMA_PATH` when packaged
- [ ] Existing default model flow still works unchanged
- [ ] Offline startup works with no runtime download
