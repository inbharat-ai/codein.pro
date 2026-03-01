# CodeIn Ship Readiness Audit

**Date**: 2026-02-28  
**Auditor Role**: Principal Engineer + Security Auditor + QA Lead + UX Reviewer  
**Method**: Evidence-only verification (commands + outputs + code-path proof)

---

## Step 0 — Repo Truth Map

### Commands Executed

```powershell
# Workspace and structure
Get-ChildItem
Get-ChildItem electron-app\src\main -Recurse -File
Get-ChildItem electron-app\src\preload -Recurse -File
Get-ChildItem gui\src -Recurse -File | Select-String "main.tsx"

# Packaging/scripts
Get-Content electron-app\package.json
Get-Content packages\agent\package.json
Get-Content packages\extension\package.json

# Bundled llama assets
Get-ChildItem electron-app\assets\llama -Recurse

# Endpoint inventory and security/runtime wiring
$content = Get-Content packages\agent\src\index.js -Raw
[regex]::Matches($content, 'if \(req\.method === "([A-Z]+)" && url\.pathname === "([^"]+)"\)') |
	ForEach-Object { "{0} {1}" -f $_.Groups[1].Value, $_.Groups[2].Value }

Select-String -Path packages\agent\src\index.js -Pattern "validateAndSanitizeInput|requireAuth|checkPermission|127.0.0.1"
Select-String -Path packages\agent\src\model-runtime\index.js -Pattern "LLAMA_PATH|DISABLE_LLAMA_AUTO_PROVISION|spawn\(|127.0.0.1"
Select-String -Path electron-app\src\main\services\AgentService.ts -Pattern "process.resourcesPath|llama|LLAMA_PATH|spawn\("
Select-String -Path packages\agent\src\model-runtime\router.js -Pattern "auto|coder|reasoner|default"

# i18n / MCP / agent registry evidence
Select-String -Path packages\agent\src\i18n\**\*.js -Pattern "orchestrator|detectLanguage|translate|stt|tts|AI4Bharat"
Select-String -Path packages\agent\src\mcp\**\*.js -Pattern "offline|fallback|requirePermission|mcp"
Select-String -Path packages\agent\src\agents\registry.js -Pattern "AgentRegistry|registerAgent|verified"
```

### What I Verified

- [x] Electron entrypoints (main/preload/renderer)
- [x] llama.cpp runtime manager + Electron bundling config
- [x] LLM providers/router/settings wiring
- [x] agents system + registry usage
- [x] MCP connectors + permission gating
- [x] JWT/auth middleware wiring
- [x] validation middleware wiring across endpoints
- [x] cache wiring
- [x] multilingual pipeline (detect/translate/STT/TTS)

### Evidence

- Electron entrypoints confirmed:
  - main: `electron-app/src/main/main.ts`
  - preload: `electron-app/src/preload/preload.ts`
  - renderer: `gui/src/main.tsx`
- Electron bundling config present in `electron-app/package.json`:
  - `extraResources` includes `assets/llama` -> `llama`
  - `extraResources` includes `../packages/agent` -> `agent`
- **Critical finding**: `electron-app/assets/llama/{win32,darwin,linux}` directories exist but no platform `llama-server` binaries were found during listing.
- Agent endpoint inventory extracted from `packages/agent/src/index.js` (47 endpoints found), including:
  - Auth (`/auth/login`, `/auth/refresh`, `/auth/logout`)
  - Runtime/models (`/runtime/*`, `/models/*`)
  - i18n/voice (`/i18n/*`, `/voice/*`, `/api/translate`, `/api/detect-language`)
  - MCP (`/mcp/servers`, `/mcp/tools`, `/mcp/activity`)
  - Permissions (`/permissions/check`, `/permissions/respond`, `/permissions/*`)
- Security/runtime wiring present:
  - `validateAndSanitizeInput`, `requireAuth`, `checkPermission` references in `packages/agent/src/index.js`
  - Agent server bind observed on `127.0.0.1`
  - Runtime env/launch controls in `packages/agent/src/model-runtime/index.js` (`LLAMA_PATH`, `DISABLE_LLAMA_AUTO_PROVISION`, `spawn(...)`, localhost bind)
  - Packaged runtime path and env handoff in `electron-app/src/main/services/AgentService.ts`
- LLM routing evidence present in `packages/agent/src/model-runtime/router.js` (coder/reasoner/default/auto routing paths).
- Multilingual pipeline evidence present in `packages/agent/src/i18n/*`:
  - Orchestrator + language detection + translate + STT + TTS codepaths
  - AI4Bharat provider integration points found
  - Placeholder notes also present in STT/TTS providers (production-hardening risk)
- MCP evidence present in `packages/agent/src/mcp/*`:
  - client manager, health checker, and offline fallback modules exist
  - `requirePermission: true` default observed for tool configs
  - HTTP MCP path explicitly marked not yet implemented (scope/limit)
- Agent registry evidence present in `packages/agent/src/agents/registry.js` (`AgentRegistry`, `registerAgent`, verification stats).
- Extension branding inconsistency observed in `packages/extension/package.json` command categories using `BharatCode` (potential product naming drift).

---

## Step 1 — Build / Lint / Typecheck Gates

### Commands Executed

```powershell
# Dependency installs
npm install
cd gui; npm install
cd packages/agent; npm install
cd electron-app; npm install
cd packages/extension; npm install
cd packages/extension; npm install --legacy-peer-deps

# Lint / typecheck / build gates
cd packages/agent; npm run lint
cd packages/agent; npm run typecheck
cd gui; npm run lint
cd gui; npm run tsc:check
cd gui; npm run build
cd electron-app; npm run build
cd packages/extension; npm run lint
cd packages/extension; npm run tsc:check
```

### Results

- Root install: PASS (2 vulnerabilities reported).
- `gui npm install`: PASS (27 vulnerabilities reported).
- `packages/agent npm install`: PASS.
- `electron-app npm install`: PASS (6 vulnerabilities reported).
- `packages/extension npm install`: **FAIL** (`ERESOLVE` conflict: `vectordb@0.4.20` peer requires `apache-arrow@^14`, root has `apache-arrow@21.1.0`).
- `packages/extension npm install --legacy-peer-deps`: PASS (mitigation only, non-clean baseline).
- `packages/agent npm run lint`: **FAIL** (ESLint v9 expects `eslint.config.*`, package script/config mismatch).
- `packages/agent npm run typecheck`: PASS (script is informational echo; not a static type gate).
- `gui npm run lint`: PASS.
- `gui npm run tsc:check`: **FAIL** (`gui/src/components/VoicePanel.tsx:353 TS1128`).
- `gui npm run build`: **FAIL** (same `VoicePanel.tsx` syntax error).
- `electron-app npm run build`: **FAIL** (5 TS errors across `ElectronIde.ts`, `GitService.ts`, `ModelManagerService.ts`, `WindowManager.ts`).
- `packages/extension npm run lint`: PASS with 257 warnings (0 errors).
- `packages/extension npm run tsc:check`: PASS.

Gate Decision for Step 1: **FAIL**

---

## Step 2 — Testing + Coverage Gates

### Commands Executed

```powershell
npm test
cd packages/agent; npm test
cd gui; npm run test:coverage
```

### Results

- `packages/agent npm test`: PASS (39/39).
- Root `npm test`: **FAIL** (`packages/shared/test/contract.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `packages/shared/src/diff.mjs`; 41 pass / 1 fail).
- `gui npm run test:coverage`: **FAIL** (17 suites failed, all blocked by `gui/src/components/VoicePanel.tsx` syntax error during transform/build).

### Minimum Critical Test Additions (if needed)

- Not added in this pass. Existing failures are gate-breakers and must be fixed before adding scope.

Gate Decision for Step 2: **FAIL**

---

## Step 3 — Security Audit (Fail-Closed)

### A) Endpoint Validation Coverage

- Route extraction script found 52 explicit route blocks in `packages/agent/src/index.js`.
- 41/52 route blocks include direct `validateAndSanitizeInput(...)` usage.
- Non-validated routes are mostly health/read/list endpoints or token/logout flow; still need explicit security sign-off per endpoint policy.

### B) JWT Enforcement Proof

- `PUBLIC_ROUTES` contains only `GET /health`, `POST /auth/login`, `POST /auth/refresh`.
- Middleware gate: `if (!isPublicRoute(req.method, url.pathname)) authenticateJWTRequest(...)`.
- Conclusion: JWT enforcement is centralized and fail-closed for non-public endpoints.

### C) Permission Fail-Closed Proof

- `requirePermission(...)` used across model download/import, MCP management/tool-call, and execute-code flows.
- Explicit deny path observed repeatedly: `if (!permission.allowed) jsonResponse(res, 403, ...)`.
- Permission enforcement exists on critical side-effect endpoints.

### D) Hardening Controls (rate limit/CORS/headers/secrets)

- Security headers middleware initialized from config (`corsOrigin`, `corsCredentials`, CSP, HSTS).
- Rate limiter middleware initialized and wrapped around request handler.
- Middleware order in code: security headers -> rate limiter -> original handler.
- Server binds to `127.0.0.1`.

### E) Prompt/Tool Security (permissions/sanitization/spawn safety)

- Input sanitization calls present across majority of POST routes.
- Runtime and agent processes are spawned using argv arrays (`spawn(...)`), not shell command concatenation.
- MCP tool calls include permission gating and audit logging modules.

Security Decision: **CONDITIONALLY PASS (implementation present), but release still blocked by failing build/test and bundling evidence gaps.**

---

## Step 4 — Electron Bundling Verification

### Requirements Checklist

- [x] extraResources verified
- [x] resource path mapping verified (win/mac/linux)
- [ ] first-run runtime copy behavior verified
- [x] chmod +x behavior verified for non-win
- [x] spawn args array verified (no shell)
- [x] host bind 127.0.0.1 verified
- [x] healthcheck verified
- [x] logging path verified
- [x] runtime status surfaced to app verified

### Evidence

- `electron-app/package.json` includes `extraResources` for `assets/llama` and `../packages/agent`.
- `AgentService.getBundledLlamaPath()` resolves `process.resourcesPath/llama/<platform>/llama-server(.exe)`.
- `AgentService` sets `LLAMA_PATH` env when bundled runtime is found.
- Runtime layer applies `fs.chmodSync(..., 0o755)` on non-Windows runtime assets.
- Agent healthcheck endpoint is polled via `http://localhost:<port>/health`.
- **Critical blocker**: filesystem inspection found no bundled `llama-server` binaries under `electron-app/assets/llama/{win32,darwin,linux}`.

Step 4 Decision: **FAIL** (artifact-level bundling proof missing)

---

## Step 5 — Offline-First and Graceful Degradation

### Commands/Simulation

```powershell
Select-String -Path packages/agent/src/**/*.js -Pattern "offline|fallback|cache"
cd packages/agent; npm test
```

### Results

- MCP offline fallback modules present (`mcp/offline-fallback.js`, `mcp/health-checker.js`).
- i18n and response caching modules present and wired.
- Agent tests include fallback/cache health checks and passed.
- Live end-to-end outage simulation was not executed in packaged desktop runtime during this pass.

Step 5 Decision: **PARTIAL PASS (code evidence present; E2E runtime simulation still required).**

---

## Step 6 — LLM Routing and Model Options

| Mode / Scenario              | Expected Behavior                   | Verified (Y/N) | Evidence                                                                                   |
| ---------------------------- | ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| Default model unchanged      | Existing default remains active     | Y              | `defaultCoder/defaultReasoner` registry logic in `model-runtime/index.js`                  |
| Qwen selectable              | Qwen available and selectable       | Y              | Qwen model specs present in catalog                                                        |
| StarCoder2 selectable        | StarCoder2 available and selectable | Y              | `starcoder2-7b-instruct-q4` present                                                        |
| CodeLlama selectable         | CodeLlama available and selectable  | Y              | `codellama-7b-instruct-q4` present                                                         |
| Auto mode only when selected | No implicit auto mode               | Y              | Router uses context preference/mode in `router.js`                                         |
| Fallback on timeout/error    | Controlled fallback path            | Y              | Router/runtime fallback logic and tests present                                            |
| Streaming behavior           | Streaming path works                | N              | `AgentService.streamCompletion` is TODO and throws `Stream completion not yet implemented` |
| Cancellation behavior        | Cancellation path works             | N              | No verified cancellation E2E proof captured in this pass                                   |
| Cross-user isolation         | No shared memory leakage            | PARTIAL        | JWT user context exists; no dedicated multi-user isolation test evidence captured          |

Step 6 Decision: **PARTIAL PASS**

---

## Step 7 — MCP Connectors and Agents

### MCP Connector Checklist

- [x] MCP client manager present
- [x] MCP health checker present
- [x] Offline fallback chain present
- [x] Permission requirement flags present
- [ ] HTTP MCP connector implementation complete (`client-manager` explicitly throws `HTTP MCP not yet implemented`)

### Agent Checklist

- [x] Agent registry class and validation present
- [x] Agent task endpoints present (`/agent/tasks/*`)
- [x] Agent tests for registry path present/passing

Step 7 Decision: **PARTIAL PASS** (HTTP MCP gap)

---

## Step 8 — UX/UI World-Class Review

### Top 20 Issues (ranked)

1. `VoicePanel.tsx` contains duplicate component return block causing syntax failure (hard blocker).
2. GUI build/typecheck blocked; app cannot ship reliably.
3. Electron main build has TS errors in core services.
4. Root test suite has module resolution failure (`diff.mjs`).
5. Streamed completion path not implemented in Electron service.
6. Extension install requires `--legacy-peer-deps` workaround (reproducibility risk).
7. Extension command category branding mismatch (`BharatCode` vs `CodIn`) creates UX inconsistency.
8. Agent lint gate broken by ESLint v9 config mismatch.
9. High warning volume in extension lint reduces signal quality.
10. Bundled llama binaries missing despite packaging config.
11. HTTP MCP path unimplemented.
12. Cross-OS packaging not verified end-to-end.
13. No proven packaged first-run runtime extraction path.
14. Coverage gate in GUI currently blocked by compile failure.
15. Vulnerability counts non-zero across multiple packages.
16. Runtime fallback behavior not demonstrated in packaged desktop.
17. Potential product naming drift in docs/metadata.
18. Some i18n STT/TTS paths still marked placeholder in comments.
19. No verified cancellation UX for long-running model responses.
20. No confirmed user-facing runtime status/error UX for missing llama binary case in production package.

### Quick Wins vs Deep Fixes

- Quick wins: remove duplicate `VoicePanel` block, fix `diff.mjs` module path/import, align ESLint config, normalize branding strings.
- Deep fixes: ship signed per-platform llama binaries, complete streaming/cancellation paths, implement/finish HTTP MCP connector, run cross-platform packaging and offline E2E matrix.

---

## Step 9 — Capabilities Matrix

| Capability Area      | Supported        | Verified Evidence                                              | Limits                                                           |
| -------------------- | ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Offline coding tasks | Partial          | Local runtime, cache, offline fallback modules present         | Missing bundled llama binaries blocks packaged offline inference |
| Multilingual         | Partial          | i18n orchestrator + detect/translate/STT/TTS codepaths present | Some provider paths include placeholder/production notes         |
| Voice I/O            | Partial          | Voice panel + STT/TTS modules present                          | GUI compile fails in `VoicePanel.tsx`; cannot ship current state |
| Agent workflows      | Yes (code-level) | Task endpoints + registry + tests                              | Needs full app build green before release                        |
| MCP/online features  | Partial          | MCP manager + tools + fallback logic present                   | HTTP MCP not implemented                                         |

---

## Step 10 — Final Verdict

### Scores (0–10)

- Security: 7.5
- Tests: 5.0
- Performance: 6.5
- Offline-first: 4.5
- LLM quality: 6.0
- Agents/MCP: 6.5
- UX/UI: 3.5
- DevOps: 4.0
- **Overall**: 5.4

### Ship Decision

- **GO / NO-GO**: **NO-GO**

### Exact Blockers

- Build gate failing in `gui` (`VoicePanel.tsx`) and `electron-app` (TypeScript errors).
- Test gate failing at root (`packages/shared/test/contract.test.mjs` module not found).
- Packaging evidence blocker: missing `llama-server` binaries in `electron-app/assets/llama/*`.
- Critical runtime feature gap: `AgentService.streamCompletion` not implemented.
- Clean extension install fails without legacy peer-deps workaround.

### Punch List to Reach World-Class

1. Fix `gui/src/components/VoicePanel.tsx` compile error and rerun GUI typecheck/build/tests.
2. Fix Electron TS build errors in `ElectronIde.ts`, `GitService.ts`, `ModelManagerService.ts`, `WindowManager.ts`.
3. Fix shared contract test import/module resolution (`diff.mjs`) and make root tests green.
4. Add actual `llama-server` binaries per target OS/arch and verify packaged runtime startup end-to-end.
5. Implement `AgentService.streamCompletion` and cancellation handling.
6. Resolve extension peer dependency conflicts without `--legacy-peer-deps`.
7. Align ESLint config in `packages/agent` for ESLint v9 and enforce a true lint gate.
8. Execute full release matrix: Windows/macOS/Linux pack + smoke + offline + MCP fallback + permissions audit.
