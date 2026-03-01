# llama.cpp Binary Discovery (CodeIn)

## Verified Binary Names

From `packages/agent/src/model-runtime/index.js` runtime manifests:

- Windows: `llama-server.exe`
- macOS: `llama-server`
- Linux: `llama-server`

## Verified Runtime Pin

- Version constant: `LLAMA_CPP_VERSION = "b3906"`
- Release base: `https://github.com/ggerganov/llama.cpp/releases/download/b3906/`

## Runtime Flow (Current)

1. `bootstrapRuntime()` checks `~/.codin/runtime/{executable}`.
2. If missing, downloads platform archive from llama.cpp release.
3. Verifies archive SHA256 from release `sha256sum.txt`.
4. Extracts runtime, chmod on non-Windows, then runs `llama-server`.
5. If download fails, falls back to runtime discovered on `PATH`.

## Packaging Requirement Alignment

To avoid compiling on user machines, Electron should bundle prebuilt runtime binaries and pass path to agent.
This is additive to current behavior and should preserve current fallback strategy.
