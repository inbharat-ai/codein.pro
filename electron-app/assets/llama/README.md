# Bundled llama.cpp Runtime Assets

Place prebuilt `llama-server` binaries here before running `npm run dist`.

Required layout:

- `win32/llama-server.exe`
- `darwin/llama-server`
- `linux/llama-server`

Source release pin used by agent runtime: `b3906`

Suggested upstream release page:
https://github.com/ggerganov/llama.cpp/releases/tag/b3906

The Electron main process passes the bundled executable path via `LLAMA_PATH` when present.
