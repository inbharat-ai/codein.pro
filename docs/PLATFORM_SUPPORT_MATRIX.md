# CodeIn Platform Support Matrix

> Last updated: 2026-03-01

## Supported Platforms

| OS                  | Arch                  | Package Type                  | llama-server Binary            | Status           | Notes                                                      |
| ------------------- | --------------------- | ----------------------------- | ------------------------------ | ---------------- | ---------------------------------------------------------- |
| Windows 10/11       | x64                   | NSIS installer + Portable ZIP | `win32/x64/llama-server.exe`   | **Supported**    | No code signing yet (SmartScreen warning on first run)     |
| Windows 11          | arm64                 | NSIS installer                | `win32/arm64/llama-server.exe` | **Experimental** | Requires ARM64 llama.cpp build; x64 may run via emulation  |
| macOS 12+           | x64 (Intel)           | DMG + ZIP                     | `darwin/x64/llama-server`      | **Supported**    | Not notarized yet — users must allow in System Preferences |
| macOS 12+           | arm64 (Apple Silicon) | DMG + ZIP                     | `darwin/arm64/llama-server`    | **Supported**    | Native Apple Silicon build preferred for performance       |
| Linux (glibc 2.31+) | x64                   | AppImage + .deb               | `linux/x64/llama-server`       | **Supported**    | Tested on Ubuntu 22.04+                                    |
| Linux               | arm64                 | AppImage                      | `linux/arm64/llama-server`     | **Experimental** | For Raspberry Pi 5 / ARM servers                           |

## Binary Source

All `llama-server` binaries are prebuilt from [llama.cpp](https://github.com/ggml-org/llama.cpp).

**Pinned release:** `b3906` (or latest stable)

Download links per platform:

- **win32/x64:** `llama-b3906-bin-win-avx2-x64.zip` → extract `llama-server.exe`
- **win32/arm64:** `llama-b3906-bin-win-arm64.zip` → extract `llama-server.exe`
- **darwin/x64:** `llama-b3906-bin-macos-x64.zip` → extract `llama-server`
- **darwin/arm64:** `llama-b3906-bin-macos-arm64.zip` → extract `llama-server`
- **linux/x64:** `llama-b3906-bin-ubuntu-x64.zip` → extract `llama-server`
- **linux/arm64:** `llama-b3906-bin-ubuntu-arm64.zip` → extract `llama-server`

## Folder Structure (in electron-app/assets/llama/)

```
assets/llama/
├── README.md
├── win32/
│   ├── x64/
│   │   └── llama-server.exe
│   └── arm64/
│       └── llama-server.exe     (experimental)
├── darwin/
│   ├── x64/
│   │   └── llama-server
│   └── arm64/
│       └── llama-server
└── linux/
    ├── x64/
    │   └── llama-server
    └── arm64/
        └── llama-server          (experimental)
```

## Runtime Behavior

1. On app start, `AgentService.getBundledLlamaPath()` resolves: `resources/llama/{platform}/{arch}/llama-server[.exe]`
2. If the binary exists, it is passed to the agent via `LLAMA_PATH` env var
3. The agent's model-runtime spawns llama-server bound to `127.0.0.1:8080`
4. On macOS/Linux, the binary is `chmod +x` at first run if needed
5. Health check retries up to 20x at 500ms intervals

## Signing & Notarization Status

| OS      | Code Signing | Notarization  | Status                                                               |
| ------- | ------------ | ------------- | -------------------------------------------------------------------- |
| Windows | Not signed   | N/A           | SmartScreen warning — user clicks "More info → Run anyway"           |
| macOS   | Not signed   | Not notarized | Gatekeeper blocks — user must allow in System Preferences → Security |
| Linux   | N/A          | N/A           | No restrictions                                                      |

**TODO for GA release:**

- Purchase Windows EV code signing certificate
- Enroll in Apple Developer Program for notarization
- Add signing steps to CI workflow
