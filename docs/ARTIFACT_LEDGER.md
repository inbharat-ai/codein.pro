# CodeIn Artifact Ledger — 2026-03-01

> Updated: Multi-platform release engineering complete. All platforms have CI
> pipelines. Windows x64 shipped locally; macOS/Linux CI-only.

## Architecture-Aware Binary Layout

CI now downloads binaries to `electron-app/resources/bin/{platform}/{arch}/`.
Electron packaging copies this into `resources/llama/{platform}/{arch}/`.
Legacy `assets/llama` is mirrored in CI for compatibility with existing code paths.

## Distributable Artifacts

### Local Builds (Windows only — macOS/Linux require CI)

| OS      | Arch | Artifact                         | Size (bytes) | SHA256                                                             | Built      | Signed? | Status      |
| ------- | ---- | -------------------------------- | ------------ | ------------------------------------------------------------------ | ---------- | ------- | ----------- |
| Windows | x64  | CodIn-1.0.0-win-x64-portable.zip | 134,272,760  | `eda78cd4d074bd6adec5768a6536be6d16f0dd79044851ddd03f5aac4b66f310` | 2026-03-01 | No      | **SHIPPED** |
| Windows | x64  | CodIn.exe (inside zip)           | 176,813,568  | `67dc2a7036860a68e5312c212c31b8772ac463ed0289fcc44897867f55075e89` | 2026-03-01 | No      | SHIPPED     |

### CI Release Artifacts (produced by `.github/workflows/release-matrix.yml`)

| OS      | Arch  | Artifact Type                           | CI Runner        | Status                   |
| ------- | ----- | --------------------------------------- | ---------------- | ------------------------ |
| Windows | x64   | NSIS installer (.exe) + Portable (.zip) | `windows-latest` | **PENDING VERIFIED RUN** |
| macOS   | x64   | DMG                                     | `macos-latest`   | **PENDING VERIFIED RUN** |
| macOS   | arm64 | DMG                                     | `macos-latest`   | **PENDING VERIFIED RUN** |
| Linux   | x64   | AppImage + .deb                         | `ubuntu-latest`  | **PENDING VERIFIED RUN** |

### CI Verification Record (must be filled after successful tag run)

| Field                 | Value     |
| --------------------- | --------- |
| GitHub Actions Run ID | `PENDING` |
| Run URL               | `PENDING` |
| Release Tag           | `PENDING` |
| Release URL           | `PENDING` |

## Bundled llama-server Binaries

| OS     | Arch  | Path                                       | Size (bytes)                    | SHA256                                                             | Status                   |
| ------ | ----- | ------------------------------------------ | ------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| win32  | x64   | `resources/bin/win32/x64/llama-server.exe` | 1,294,848 (local source binary) | `d4a1dbde7091a2dda4aeb7066d4ae098d705f6c06575cecd1baca86b0bb6a2da` | **VERIFIED LOCAL**       |
| darwin | x64   | `resources/bin/darwin/x64/llama-server`    | CI-populated                    | CI-generated                                                       | **PENDING VERIFIED RUN** |
| darwin | arm64 | `resources/bin/darwin/arm64/llama-server`  | CI-populated                    | CI-generated                                                       | **PENDING VERIFIED RUN** |
| linux  | x64   | `resources/bin/linux/x64/llama-server`     | CI-populated                    | CI-generated                                                       | **PENDING VERIFIED RUN** |

**CI gates:**

- binary must exist
- binary size must be `> 1,000,000` bytes
- binary must execute `--help`

**Source:** llama.cpp release `b3906` — [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp/releases/tag/b3906)

## Smoke Test Results

### Windows (local — automated E2E)

| Test                                         | Result                                 |
| -------------------------------------------- | -------------------------------------- |
| llama-server binary exists at `win32/x64/`   | PASS                                   |
| llama-server binary is executable            | PASS                                   |
| llama-server spawns and healthcheck responds | PASS                                   |
| llama-server shuts down (taskkill)           | PASS                                   |
| SIGTERM shutdown                             | PASS (platform-specific shutdown path) |

**Command:** `node --test electron-app/test/llama-spawn.e2e.test.cjs`
**Result target:** 4 pass / 0 fail / 0 skip (after CI model provisioning)

### macOS / Linux (CI — mandatory inference smoke)

Each CI job runs:

1. start `llama-server` with downloaded tiny GGUF model
2. check `/health` returns 200
3. run `/completion` inference request and validate non-empty `content`
4. terminate process cleanly

## CI Workflow Reference

**File:** `.github/workflows/release-matrix.yml`

| Job                  | Runner           | What It Does                                                                                                                |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `build-win-x64`      | `windows-latest` | Downloads llama-server + tiny GGUF, verifies size/executable, runs mandatory inference E2E, builds NSIS+portable, checksums |
| `build-mac` (matrix) | `macos-latest`   | Downloads llama-server + tiny GGUF, verifies size/executable, runs mandatory inference E2E, builds DMG, checksums           |
| `build-linux-x64`    | `ubuntu-latest`  | Downloads llama-server + tiny GGUF, verifies size/executable, runs mandatory inference E2E, builds AppImage+deb, checksums  |
| `release`            | `ubuntu-latest`  | Aggregates checksums + artifacts, publishes GitHub Release                                                                  |

**Trigger:** `git push --tags v*` or manual `workflow_dispatch`

## Runtime Binary Resolution (AgentService)

```
Priority 1: resources/llama/{platform}/{arch}/llama-server[.exe]   ← NEW arch-aware
Priority 2: resources/llama/{platform}/llama-server[.exe]          ← legacy flat
Priority 3: resources/bin/llama-server[.exe]                       ← oldest
```

On macOS/Linux, `chmod +x` is applied automatically at first run.

## Remaining Blockers

| Blocker                                    | Impact                                     | Resolution                                                                 |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------- |
| No macOS code signing certificate          | Gatekeeper blocks first launch             | Enroll in Apple Developer Program, add `APPLE_ID`/`CSC_LINK` to CI secrets |
| No Windows EV code signing certificate     | SmartScreen warning on first install       | Purchase EV cert, add `CSC_LINK`/`CSC_KEY_PASSWORD` to CI secrets          |
| win32/arm64 llama-server not yet available | ARM64 Windows users must use x64 emulation | Add to CI when llama.cpp publishes arm64 Windows builds                    |
| linux/arm64 untested                       | Raspberry Pi / ARM server users            | Add `ubuntu-arm64` runner when available                                   |

## Conclusion

| OS          | Arch  | Ship Status              | Evidence                                                   |
| ----------- | ----- | ------------------------ | ---------------------------------------------------------- |
| **Windows** | x64   | **GO**                   | Portable zip shipped, E2E smoke passed, 298 tests pass     |
| **Windows** | arm64 | **EXPERIMENTAL**         | x64 binary runs under emulation; no native binary yet      |
| **macOS**   | x64   | **PENDING VERIFIED RUN** | Workflow implemented; requires successful tag run evidence |
| **macOS**   | arm64 | **PENDING VERIFIED RUN** | Workflow implemented; requires successful tag run evidence |
| **Linux**   | x64   | **PENDING VERIFIED RUN** | Workflow implemented; requires successful tag run evidence |
| **Linux**   | arm64 | **EXPERIMENTAL**         | Placeholder only; no CI runner for arm64 Linux             |

**Overall:** Windows x64 is shipped. macOS + Linux are technically pipeline-ready but cannot be marked shipped until a successful CI release run is published with run ID, artifact list, and checksums.
