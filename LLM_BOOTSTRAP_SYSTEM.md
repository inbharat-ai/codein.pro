# CodeIn Computer - LLM Auto-Setup System

## Overview

The CodeIn Computer feature requires a local LLM (Large Language Model) to function. To make this work "out of the box," we've implemented the **LLMBootstrapService** which automatically handles:

1. **Detecting** if a local LLM server is already running
2. **Downloading** a default model from Hugging Face if needed
3. **Starting** the llama.cpp inference server automatically
4. **Reporting progress** to the UI during setup

## How It Works

### On App Startup

When CodeIn launches, the main process:

```typescript
// Starts LLM bootstrap in background  — don't block app startup
this.llmBootstrapService.ensureReady(60000); // 60-second timeout
```

- This runs **non-blocking** in the background
- The app starts immediately even if LLM setup is still in progress
- Progress is reported via console logs and can be displayed in UI

### Model Selection

The service tries models in this order:

| Model                              | Size   | Speed       | Quality | Auto-Download       |
| ---------------------------------- | ------ | ----------- | ------- | ------------------- |
| `mistral-7b-instruct.Q3_K_S.gguf`  | 2.8 GB | ⚡ Fast     | ★★★★    | ✅ Yes (default)    |
| `mistral-7b-instruct.Q4_K_M.gguf`  | 4.5 GB | ⚡⚡ Medium | ★★★★★   | ✅ Backend fallback |
| Any existing `mistral-*.gguf` file | —      | —           | —       | ✅ Reused           |

All models are stored in `~/.codin/models/llm/`

### Server Details

- **Port:** 43121 (localhost only, no network access)
- **Process:** `llama-server` binary (must be installed or bundled)
- **Context:** 2048 tokens
- **Max output:** 512 tokens per request
- **GPU:** Auto-offloads all layers if CUDA/Metal available

## Prerequisites

To use the Computer feature, one of these must be true:

### ✅ Option 1: Pre-installed llama.cpp (Recommended)

Users install llama.cpp from [llama.cpp releases](https://github.com/ggerganov/llama.cpp/releases) and add it to PATH:

```bash
# macOS/Linux
brew install llama.cpp
# or download binary and add to PATH

# Windows
# Download llama.cpp from releases, add to PATH
setx PATH "%PATH%;C:\path\to\llama.cpp\bin"
```

Then CodeIn auto-downloads Mistral-7B and starts inference.

### ✅ Option 2: Bundled llama.cpp

The Electron installer bundles llama.cpp binary:

```
CodeIn.app/
  Contents/
    MacOS/
      codein
    Resources/
      bin/
        llama-server  <-- bundled binary
```

CodeIn finds and uses this binary automatically.

### ✅ Option 3: Existing Model

If user already has a GGUF model in `~/.codin/models/llm/`, the service skips download and goes straight to starting the server.

## States and Transitions

```
[checking] → Is server already running?
   ├─ YES → [ready] ✓
   └─ NO  → [downloading] (if needed)
             ↓
           [starting] server process
             ↓
           [waiting] for server health check
             ├─ READY → [ready] ✓
             └─ TIMEOUT → [error] ✗
```

## UI Integration

The GUI can subscribe to LLM bootstrap progress:

```typescript
// In renderer process
const status = await ipcRenderer.invoke("llm:ensureReady", 60000);
console.log(status); // true if ready, false if timeout/error

const isRunning = await ipcRenderer.invoke("llm:isRunning");
console.log(isRunning); // boolean health check
```

## Error Handling

If LLM setup fails, the app **still starts** but:

- 🟡 ComputePanel shows "LLM not available" warning
- 🟡 User can manually download/setup via Settings
- ⏭️ Other features (Chat, Autocomplete, etc.) work normally

Example fallback message:

> **LLM Server Unavailable**
>
> CodeIn couldn't auto-start the local LLM. Install llama.cpp or download a GGUF model manually.
>
> [Setup Guide] [Download Model] [Try Cloud AI]

## Testing

### Test Auto-Setup Success

```bash
# Pre-install llama.cpp
brew install llama.cpp  # macOS

# Launch CodeIn
cd electron-app
npm start

# Should see in console:
# [LLMBootstrap] Checking for local LLM server...
# [LLMBootstrap] Downloading mistral-7b-instruct.Q3_K_S.gguf from Hugging Face...
# [LLMBootstrap] Started llama-server on port 43121
# [LLMBootstrap] Ready for CodeIn Computer
```

### Test Already-Running Server

```bash
# Start llama.cpp manually in another terminal
llama-server -m ~/Downloads/mistral-7b.gguf --port 43121

# Launch CodeIn
npm start

# Should see:
# [LLMBootstrap] Checking for local LLM server...
# [LLMBootstrap] LLM Server is already running
# [LLMBootstrap] Ready for CodeIn Computer
```

### Test Graceful Fallback

```bash
# Don't install llama.cpp
# Launch CodeIn
npm start

# Should see:
# [LLMBootstrap] Checking for local LLM server...
# [LLMBootstrap] Downloading mistral-7b-instruct.Q3_K_S.gguf...
# [LLMBootstrap] curl failed, trying Node HTTPS...
# (model downloads)
# [LLMBootstrap] llama.cpp not found, Computer feature unavailable
```

## Future Improvements

1. **Bundle llama.cpp** in installer for zero-setup
2. **GPU detection** and optimized model selection
3. **Streaming progress** UI during model download
4. **One-click model management** panel
5. **Cloud fallback** if local LLM unavailable
6. **Quantized variants** for low-memory devices

## Related Files

- **Service:** `electron-app/src/main/services/LLMBootstrapService.ts` (340 lines)
- **Integration:** `electron-app/src/main/main.ts` (startup)
- **IPC handlers:** `electron-app/src/main/ipc/IpcHandler.ts` (llm:\* channels)
- **Compute Engine:** `packages/agent/src/compute/` (uses LLM for planning/execution)
