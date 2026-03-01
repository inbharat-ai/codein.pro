# Local Model Runtime System

## Overview

CodIn includes a **complete local model runtime system** that eliminates the need for external dependencies like Ollama. Everything is managed automatically by CodIn Agent.

## Architecture

```
┌─────────────────────────────────────────┐
│   VS Code Extension (GUI)               │
│   - Model Manager Panel                 │
│   - Download progress UI                │
│   - Model selection                     │
└──────────────┬──────────────────────────┘
               │ HTTP/REST
┌──────────────▼──────────────────────────┐
│   CodIn Agent (localhost:43120)         │
│   - Model Runtime Manager                │
│   - Auto Model Router                    │
│   - Inference Engine                     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   Local Storage                          │
│   ~/.codin/                         │
│   ├── runtime/      (llama.cpp)         │
│   ├── models/       (GGUF files)        │
│   └── models.json   (registry)          │
└─────────────────────────────────────────┘
```

## Features

### 1. Automatic Runtime Bootstrap

**No manual installation required.** On first use, CodIn automatically:

1. Detects your operating system (Windows/macOS/Linux)
2. Downloads the appropriate llama.cpp binary
3. Verifies checksum
4. Stores in `~/.codin/runtime/`

**Supported Platforms:**

- Windows (CUDA and CPU versions)
- macOS (Apple Silicon and Intel)
- Linux (x64 and ARM)

### 2. Model Manager

Access via: **Settings → Models → Model Manager**

#### Default Model Catalog

| Model                       | Type     | Size   | RAM  | Purpose                 |
| --------------------------- | -------- | ------ | ---- | ----------------------- |
| Qwen2.5 Coder 7B (Q4)       | Coder    | 4.3 GB | 8 GB | Default coding tasks    |
| Qwen2.5 Coder 1.5B (Q8)     | Coder    | 1.6 GB | 4 GB | Lightweight coding      |
| DeepSeek-R1 Distill Qwen 7B | Reasoner | 4.5 GB | 8 GB | Complex reasoning tasks |

#### Model Manager UI

- **View installed models**: Size, RAM requirements, installation date
- **Browse available models**: Download from catalog
- **Import local GGUF**: Add custom models from disk
- **Set default**: Choose coder and reasoner models
- **Delete models**: Free up disk space

#### Download Process

1. Click "Download" on any available model
2. Progress bar shows download status
3. Automatic checksum verification
4. Model automatically registered
5. Set as default for its type (optional)

### 3. Auto Model Router

**Intelligent model selection** based on task complexity:

#### Routing Logic

**Use Reasoner Model when:**

- Mode is "Plan"
- Prompt contains keywords: architecture, refactor, migration, security, CI/CD, design pattern
- Context length > 12k characters

**Use Coder Model for:**

- Standard coding tasks
- File edits
- Quick questions

#### Example

```typescript
const decision = modelRouter.route({
  prompt: "Refactor this architecture to use microservices",
  mode: "plan",
  contextLength: 5000,
  preference: "auto",
});
// Result: { modelType: "reasoner", reason: "Mode 'plan' requires reasoning model" }
```

### 4. Inference Engine

Powered by llama.cpp with:

- **Streaming token output**
- **Configurable parameters**: temperature, top_p, max_tokens
- **Context window**: Up to 8192 tokens (configurable)
- **CPU and GPU support**: CUDA, Metal, Vulkan (when available)

#### System Requirements Check

Before loading a model, CodIn checks:

- Available RAM vs. recommended RAM
- CPU cores
- Disk space

**Warnings displayed if:**

- Free RAM < recommended RAM
- Model too large for system

### 5. Model Storage

All models stored in: `~/.codin/models/`

#### Registry Format: `models.json`

```json
{
  "installedModels": [
    {
      "id": "qwen2.5-coder-7b-instruct-q4",
      "name": "Qwen2.5 Coder 7B (Q4)",
      "type": "coder",
      "size": 4300000000,
      "path": "/Users/you/.codin/models/qwen2.5-coder-7b-instruct-q4_k_m.gguf",
      "recommendedRAM": 8,
      "installedAt": "2026-02-27T10:00:00Z"
    }
  ],
  "defaultCoder": "qwen2.5-coder-7b-instruct-q4",
  "defaultReasoner": null,
  "catalog": [
    /* available models */
  ]
}
```

## REST API Endpoints

All endpoints: `http://localhost:43120/runtime/*`

### List Models

```http
GET /runtime/models
```

Response:

```json
{
  "installed": [
    /* LocalModel[] */
  ],
  "available": [
    /* AvailableModel[] */
  ],
  "defaults": {
    "coder": "qwen2.5-coder-7b-instruct-q4",
    "reasoner": null
  }
}
```

### Download Model

```http
POST /runtime/models/download
Content-Type: application/json

{
  "modelId": "qwen2.5-coder-7b-instruct-q4"
}
```

### Import Local Model

```http
POST /runtime/models/import
Content-Type: application/json

{
  "filePath": "/path/to/model.gguf",
  "name": "My Custom Model",
  "type": "coder"
}
```

### Set Default Model

```http
POST /runtime/models/set-default
Content-Type: application/json

{
  "modelId": "qwen2.5-coder-7b-instruct-q4",
  "type": "coder"
}
```

### Delete Model

```http
DELETE /runtime/models/{modelId}
```

### Start Inference

```http
POST /runtime/inference/start
Content-Type: application/json

{
  "modelId": "qwen2.5-coder-7b-instruct-q4",
  "options": {
    "port": 8080,
    "contextSize": 8192
  }
}
```

Response:

```json
{
  "success": true,
  "model": "Qwen2.5 Coder 7B (Q4)",
  "port": 8080,
  "endpoint": "http://localhost:8080"
}
```

### Stop Inference

```http
POST /runtime/inference/stop
```

### Get Status

```http
GET /runtime/status
```

Response:

```json
{
  "running": true,
  "model": {
    "id": "qwen2.5-coder-7b-instruct-q4",
    "name": "Qwen2.5 Coder 7B (Q4)",
    "type": "coder"
  },
  "resources": {
    "totalRAM": 16,
    "freeRAM": 8,
    "cpuCount": 8,
    "platform": "darwin",
    "arch": "arm64"
  }
}
```

### Model Router Decision

```http
POST /runtime/router
Content-Type: application/json

{
  "prompt": "Explain this architecture",
  "mode": "ask",
  "contextLength": 5000,
  "preference": "auto"
}
```

Response:

```json
{
  "modelType": "coder",
  "reason": "Standard coding task",
  "preference": "auto"
}
```

## User Workflow

### First Time Setup

1. **Install CodIn** (no additional setup needed)
2. **Open Model Manager** (Settings → Models)
3. **Download a model** (e.g., Qwen2.5 Coder 1.5B for low RAM)
4. **Start coding** (model loads automatically on first chat)

### Daily Usage

1. **Chat naturally** – model router selects appropriate model
2. **Complex tasks** – reasoner model used automatically for planning
3. **Model management** – download, delete, or import models anytime

### Zero Subscription Cost

- **All models run locally**
- **No API keys required**
- **Full offline support** (after initial download)
- **No recurring costs**

## Performance Optimization

### Model Quantization

All default models use **Q4 or Q8 quantization**:

- **Q4_K_M**: 4-bit quantization, 50% size, minimal quality loss
- **Q8_0**: 8-bit quantization, 75% size, excellent quality

### Memory Management

**Automatic unloading**:

- Models unload when not in use
- Manual unload: Stop inference via Model Manager

**RAM Recommendations**:

- 1.5B models: 4GB minimum
- 7B models: 8GB minimum
- 13B models: 16GB minimum

### CPU vs GPU

**CPU-only by default** for maximum compatibility.

**GPU support** (future):

- CUDA (NVIDIA)
- Metal (Apple Silicon)
- Vulkan (AMD/Intel)

## Troubleshooting

### Model Download Failed

**Symptoms**: Download stops or fails with error

**Solutions**:

1. Check internet connection
2. Ensure sufficient disk space (models are 1-5 GB)
3. Try again (resume support planned)
4. Use browser to download GGUF manually, then import

### Insufficient RAM Warning

**Symptoms**: Warning displayed when loading model

**Solutions**:

1. Close other applications to free RAM
2. Choose a smaller model (e.g., 1.5B instead of 7B)
3. Use cloud models if local resources insufficient

### llama.cpp Not Found

**Symptoms**: "llama.cpp not found" error

**Solutions**:

1. Ensure CodIn Agent is running
2. Check `~/.codin/runtime/` directory
3. Manually install `llama-server` and add to PATH
4. Restart CodIn Agent

### Model Not Loading

**Symptoms**: Model fails to start inference

**Solutions**:

1. Check model file integrity (re-download if corrupted)
2. Ensure model file is valid GGUF format
3. Verify sufficient RAM available
4. Check CodIn Agent logs for errors

## Advanced Configuration

### Custom Model Catalog

Edit `~/.codin/models.json` to add custom models:

```json
{
  "catalog": [
    {
      "id": "my-custom-model",
      "name": "My Custom Model",
      "type": "coder",
      "size": 3000000000,
      "recommendedRAM": 6,
      "url": "https://example.com/my-model.gguf",
      "filename": "my-model.gguf"
    }
  ]
}
```

### Inference Parameters

Customize at runtime when starting inference:

```typescript
{
  "modelId": "qwen2.5-coder-7b-instruct-q4",
  "options": {
    "port": 8080,
    "contextSize": 16384,  // Larger context
    "temperature": 0.7,     // More creative
    "topP": 0.9,
    "maxTokens": 2048
  }
}
```

## Benefits

✅ **No manual setup** – automatic runtime bootstrap  
✅ **Offline-first** – works without internet after download  
✅ **Zero cost** – no API subscriptions needed  
✅ **Privacy** – all inference happens locally  
✅ **Intelligent routing** – automatic model selection  
✅ **Easy management** – UI for all operations  
✅ **Extensible** – import custom GGUF models

## Future Enhancements

- [ ] GPU acceleration (CUDA/Metal/Vulkan)
- [ ] Model download resume support
- [ ] Automatic model updates
- [ ] Fine-tuning support
- [ ] Multi-model ensemble
