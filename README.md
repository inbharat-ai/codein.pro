<div align="center">

<img src="./landing/assets/codein-logo.png" alt="CodIn" width="120" />

# CodIn

### Multilingual AI Coding Platform

[![CodIn v1.0.0](https://img.shields.io/badge/CodIn-v1.0.0-6366f1?style=for-the-badge&labelColor=0a0a0f)](https://github.com/inbharat-ai/codein.pro)
[![Node.js 20.19+](https://img.shields.io/badge/Node.js-20.19+-10b981?style=for-the-badge&logo=node.js&logoColor=white&labelColor=0a0a0f)](https://nodejs.org/)
[![TypeScript 5+](https://img.shields.io/badge/TypeScript-5+-3178c6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=0a0a0f)](https://www.typescriptlang.org/)
[![License Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-f97316?style=for-the-badge&labelColor=0a0a0f)](LICENSE)

[![Stars](https://img.shields.io/github/stars/inbharat-ai/codein.pro?style=social)](https://github.com/inbharat-ai/codein.pro)
[![Open Source](https://img.shields.io/badge/Open_Source-Free_Forever-10b981?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-6366f1?style=flat-square)](CONTRIBUTING.md)

---

**CodIn is a world-class AI coding platform built to combine Cursor/Copilot-class workflows with multilingual intelligence, local-first control, and practical low-cost AI execution.**

_Vibe coding · Autonomous task flows · Repo-aware development · Natural-language commands in Hindi, Hinglish, and 19 Indian languages — normalized into English internally for accurate AI execution._

**By Bharat, for the world.** 🇮🇳

<br/>

[⬇️ Download](https://github.com/inbharat-ai/codein.pro/releases) · [📖 Docs](./docs/) · [🐛 Issues](https://github.com/inbharat-ai/codein.pro/issues) · [💬 Discussions](https://github.com/inbharat-ai/codein.pro/discussions)

</div>

<br/>

---

<br/>

## 🎯 What Makes CodIn Different

> **CodIn is not a code editor with AI attached. It is designed as a full AI coding system** — local-first execution, agent orchestration, multilingual understanding, autonomous workflows, and visible control over what the AI is doing.

Built to reach the same trust, speed, and usability standard people expect from **Cursor** and **GitHub Copilot**, while adding strengths that matter for Bharat and global developers alike.

<table>
<tr>
<td width="50%">

### 🎨 Vibe Coding, Not Just Autocomplete

Not limited to single-line suggestions. Describe what you want in natural language and CodIn helps **plan, generate, refactor, validate, and improve code** across the project.

- ✅ Feature generation
- ✅ Repo-aware edits
- ✅ Multi-step coding workflows
- ✅ Guided implementation
- ✅ Autonomous coding pipelines
- ✅ Multi-file changes

</td>
<td width="50%">

### 🌍 Multilingual Command Understanding

Type or speak in **Hindi, Hinglish, Bengali-English mix, Assamese-English mix**, and other multilingual patterns. CodIn normalizes input into an internal English task format for precise AI execution.

- 💬 _"login page bana do with Google auth"_
- 💬 _"is repo ka backend improve karo"_
- 💬 _"dashboard ko aur clean banao"_

→ Interpreted and converted into structured coding intent.

</td>
</tr>
<tr>
<td width="50%">

### 💰 Powerful AI, Practical Cost

Core AI workflows run without forcing expensive usage patterns. **Local-first execution, intelligent routing**, and built-in agent capabilities keep the tool accessible and cost-efficient.

> _CodIn aims to feel powerful like premium tools, while staying much more practical and accessible._

</td>
<td width="50%">

### 🔒 Local-First Control

Your workflows stay in **your environment** — not in a remote black-box editor. Better visibility, more control, stronger foundation for **privacy-conscious and enterprise-friendly** development.

</td>
</tr>
<tr>
<td colspan="2" align="center">

### 🌐 Built for Language Expansion

The multilingual layer is extensible — support grows across **more Indian and global languages** over time.
The vision: **make AI coding usable for people who do not naturally think only in English.**

</td>
</tr>
</table>

<br/>

---

<br/>

## 🧠 Multilingual Intelligence

<div align="center">

> CodIn detects your language via Unicode script analysis, preserves technical terms using pattern matching,
> and normalizes multilingual input into structured English for AI execution.
> Translation quality depends on the configured backend (AI4Bharat, cloud, or LLM fallback).

</div>

<table>
<tr>
<th align="center">🗣️ What you say (Hinglish)</th>
<th align="center">⚙️ What CodIn understands</th>
</tr>
<tr>
<td align="center">

**"Mere liye ek dashboard banao jisme login, profile aur settings ho."**

</td>
<td align="center">

**"Create a dashboard with authentication, user profile, and settings pages."**

</td>
</tr>
<tr>
<td align="center">

_"login page bana do with Google auth"_

</td>
<td align="center">

_"Create a login page with Google OAuth integration"_

</td>
</tr>
<tr>
<td align="center">

_"is repo ka backend improve karo"_

</td>
<td align="center">

_"Improve the backend of this repository"_

</td>
</tr>
<tr>
<td align="center">

_"dashboard ko aur clean banao"_

</td>
<td align="center">

_"Clean up and improve the dashboard UI"_

</td>
</tr>
</table>

<br/>

**How it works:**

```
User input (any language) → Detect script (Unicode) → Preserve technical terms (regex patterns)
  → Translate via provider (AI4Bharat / Cloud / LLM fallback) → English task → AI execution
```

> **Setup note:** Language detection works out of the box. For translation, you need at least one backend configured:
> AI4Bharat IndicTrans2 server (best quality, ~3GB model download), cloud provider credentials (Azure/Google),
> or a local LLM via llama.cpp.

**Language detection:** Hindi · Tamil · Bengali · Telugu · Marathi · Gujarati · Kannada · Malayalam · Punjabi · Assamese · Odia · Urdu · Sindhi · Konkani · Manipuri · Dogri · Bodo · Santali — plus mixed-language patterns (Hinglish, Benglish, Tanglish, etc.)

> **Note:** 10 languages have full technical term preservation (Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, Punjabi, Urdu). Others have script-level detection. Translation quality depends on available backend: AI4Bharat (best), cloud providers (good), or LLM fallback (acceptable). Sanskrit is not yet configured.

<br/>

---

<br/>

## 🎨 Vibe Coding Experience

> The developer focuses on **intent, direction, and quality**. CodIn handles the heavy lifting across implementation steps.

<table>
<tr>
<td align="center" width="25%">

**💡 Describe**
<br/>the feature

</td>
<td align="center" width="25%">

**🔨 Full Stack**
<br/>frontend + backend flow

</td>
<td align="center" width="25%">

**🔄 Refactor**
<br/>improve existing code

</td>
<td align="center" width="25%">

**🎨 UI/UX**
<br/>improve design

</td>
</tr>
<tr>
<td align="center">

**🐛 Fix Bugs**
<br/>find and resolve issues

</td>
<td align="center">

**📄 Generate**
<br/>missing files

</td>
<td align="center">

**✅ Validate**
<br/>test and iterate

</td>
<td align="center">

**📦 Multi-File**
<br/>cross-project changes

</td>
</tr>
</table>

> _The long-term goal: CodIn feels like a serious AI engineering partner, not just a code suggestion box._

<br/>

---

<br/>

## ⚡ Why This Matters

<table>
<tr>
<th align="center">❌ Most tools assume</th>
<th align="center">✅ CodIn delivers</th>
</tr>
<tr>
<td>The user thinks in English</td>
<td><b>Natural multilingual interaction</b></td>
</tr>
<tr>
<td>The user wants only inline completion</td>
<td><b>Stronger repo-aware workflows</b></td>
</tr>
<tr>
<td>The AI is a helper, not a workflow engine</td>
<td><b>Affordable, practical AI-assisted development</b></td>
</tr>
<tr>
<td>Powerful AI must always be expensive</td>
<td><b>Local-first control + future-ready expansion</b></td>
</tr>
</table>

<br/>

---

<br/>

## 🏆 CodIn vs. Paid Tools

<div align="center">

| Feature                           |   **CodIn**    | Cursor ($20/mo) | Copilot ($10/mo) | Windsurf ($15/mo) |
| :-------------------------------- | :------------: | :-------------: | :--------------: | :---------------: |
| AI Code Completion                |       ✅       |       ✅        |        ✅        |        ✅         |
| AI Chat & Agent Mode              |       ✅       |       ✅        |        ✅        |        ✅         |
| **100% Free & Open Source**       |     **✅**     |       ❌        |        ❌        |        ❌         |
| **Local AI via llama.cpp** ¹      |     **✅**     |       ❌        |        ❌        |        ❌         |
| **BYO: 50+ AI Providers** ⁴       |     **✅**     |        ~        |        ❌        |         ~         |
| **19 Indian Language Detection**  |     **✅**     |       ❌        |        ❌        |        ❌         |
| **Voice Coding Infrastructure** ² |     **✅**     |       ❌        |        ❌        |        ❌         |
| MCP Tool Protocol                 |       ✅       |       ✅        |        ~         |        ✅         |
| Built-in Web Research ³           |       ✅       |        ~        |        ❌        |        ✅         |
| **Zero Telemetry / No Tracking**  |     **✅**     |       ❌        |        ❌        |        ❌         |
| Local Compute Engine              |       ✅       |       ❌        |        ❌        |        ❌         |
| **Price**                         | **$0 forever** |     $20/mo      |      $10/mo      |      $15/mo       |

> ¹ llama.cpp binaries are downloaded at build time or on first launch (~100 MB), not pre-bundled in the repo.<br/>
> ² Voice coding (STT/TTS) requires external setup: Whisper, Piper, or cloud credentials (Azure/Google).<br/>
> ³ Free search uses DuckDuckGo instant answers; premium providers (Tavily, Brave, SerpAPI) need API keys.<br/>
> ⁴ Bring your own API key for OpenAI, Anthropic, Gemini, Groq, Mistral, Deepseek, Ollama, Azure, Bedrock, Together, Fireworks, Replicate, OpenRouter, and 40+ more.

</div>

<table>
<tr>
<td align="center" width="33%">

**💰 Free Forever**

No subscription, no usage limits, no premium tiers. CodIn is open-source under Apache 2.0.

</td>
<td align="center" width="33%">

**🔐 Your Code Stays Yours**

With local AI inference via llama.cpp, your code and prompts stay on your machine. No mandatory cloud dependency.

</td>
<td align="center" width="33%">

**🇮🇳 Built for Bharat**

Language detection for 19 Indian languages with technical term preservation. Multilingual coding commands normalized into English for AI execution.

</td>
</tr>
</table>

<br/>

### 🔌 Bring Your Own AI

CodIn supports **50+ LLM providers** out of the box. Plug in your own API key and use the model you prefer:

<table>
<tr>
<td align="center">

**Cloud AI**<br/>
OpenAI · Anthropic · Gemini · Groq · Mistral · Deepseek · Cohere · xAI

</td>
<td align="center">

**Hosted Inference**<br/>
Together · Fireworks · Replicate · SambaNova · Cerebras · DeepInfra · OpenRouter

</td>
<td align="center">

**Local / Self-Hosted**<br/>
Ollama · LM Studio · llama.cpp · Llamafile · vLLM · Text Generation WebUI

</td>
<td align="center">

**Enterprise**<br/>
Azure OpenAI · AWS Bedrock · Google VertexAI · SageMaker · WatsonX · Nvidia NIM

</td>
</tr>
</table>

> Configure via `POST /external-providers/configure` with your API key, or set the provider in your CodIn config file. SSE streaming supported for all providers.

<br/>

---

<br/>

## 🚀 Production Features

<table>
<tr><td>

| Category                 | Capability                                                                                                                                       |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| 🌍 **Multilingual**      | Language detection for 19 Indian languages (10 with full technical term preservation). Normalizes multilingual input to English for AI execution |
| 🎙️ **Voice Coding**      | STT/TTS infrastructure for 13 languages. Requires external setup: Whisper/Piper/espeak or Azure/Google credentials                               |
| ⚡ **Vibe Coding**       | Live agent orchestration, session isolation, compute pipeline, pause/resume/cancel                                                               |
| 🔗 **Live Bridge**       | Client ↔ Agent HTTP + SSE for task streaming, permission loops, real-time feedback                                                              |
| 🧮 **Compute Routing**   | Local, swarm, GPU (RunPod), and external API escalation with budget guardrails. Dedicated GPU panel UI for pod management                        |
| 🔒 **Session Isolation** | Safe multi-user and parallel workflows, sandboxed workspaces, policy enforcement                                                                 |
| 🛡️ **Reliability**       | Circuit breaker, retry/backoff, timeout, audit logging                                                                                           |
| 📊 **Observability**     | Health, compute, sessions, agents, pipeline, metrics, audit logs                                                                                 |
| 🔍 **Research API**      | Serper-compatible endpoint; DuckDuckGo fallback (no API keys); premium providers optional                                                        |
| 🔌 **MCP Tools**         | Connect to MCP-compatible servers — GitHub, Slack, Jira, DBs, Docker, Kubernetes, RunPod GPU (10 tools)                                          |
| 📋 **Compute Pipeline**  | Goal → plan → execute → artifact, sandbox isolation, multilingual I/O                                                                            |
| 🤖 **Local AI**          | llama.cpp integration (binaries downloaded at build/first launch); local inference, no mandatory cloud                                           |
| 🔌 **BYO Providers**     | 50+ LLM providers: OpenAI, Anthropic, Gemini, Groq, Mistral, Deepseek, Ollama, Azure, Bedrock, and more. Bring your own API key                  |
| ✨ **Autocomplete**      | Context-aware ghost-text, project-aware, LRU-cached, works with local and cloud models                                                           |
| 💬 **AI Chat & Edit**    | Conversational interface, @-mentions for files and symbols, inline code editing                                                                  |
| 🕵️ **100% Private**      | No telemetry, no tracking. Local-first by default                                                                                                |
| 💻 **Cross-Platform**    | Windows (primary). macOS and Linux builds in progress                                                                                            |

</td></tr>
</table>

**Unified capabilities:**

- Research endpoint: `POST /api/research/serper` (DuckDuckGo fallback; API keys optional for premium providers)
- Unified local/swarm/GPU routing
- Autonomous coding pipeline infrastructure: idea → spec → code → test → review → delivery
- Tool-execution safety built into agent behavior

<br/>

---

<br/>

## 🖥️ GPU on Demand — RunPod Integration

> **Need GPU compute?** CodIn connects directly to [RunPod](https://www.runpod.io/) via MCP, so the AI agent can help you provision, manage, and tear down GPU pods on demand.

### How It Works

```
You:   "I need an A100 to fine-tune my model"
CodIn: → Checks available GPUs & pricing via RunPod GraphQL API
       → Provisions a pod with your chosen Docker image
       → Monitors cost, auto-stops on TTL/idle/budget
       → Tears down when done
```

### GPU Management Panel

CodIn includes a dedicated **GPU panel** (`/gpu` route) with:

- **Connect tab** — Enter your RunPod API key, set budget cap and session TTL
- **GPU Types tab** — Browse all available GPUs with VRAM, pricing, and cloud availability. Click to select.
- **Pods tab** — View active pods, uptime, and stop/terminate controls
- **Jobs tab** — Submit serverless inference jobs and check status
- **Budget bar** — Live spend tracking with color-coded progress (green → amber → red)

### MCP-Powered — The Agent Helps You

CodIn ships a **built-in RunPod MCP server** (`runpod-gpu`) that exposes 10 tools the AI can use:

| Tool                   | What it does                            |
| ---------------------- | --------------------------------------- |
| `runpod_connect`       | Store your RunPod API key securely      |
| `runpod_list_gpus`     | Browse available GPUs with live pricing |
| `runpod_create_pod`    | Spin up an on-demand GPU pod            |
| `runpod_pod_info`      | Check pod status, utilization, ports    |
| `runpod_stop_pod`      | Stop pod (keeps volume for later)       |
| `runpod_terminate_pod` | Destroy pod + volume permanently        |
| `runpod_list_pods`     | See all pods in your account            |
| `runpod_run_job`       | Submit serverless inference jobs        |
| `runpod_job_status`    | Check async job progress                |
| `runpod_session_info`  | View spend, budget remaining, timers    |

### Safety Guardrails

- **Budget cap** — Set max spend per session (default $100). Auto-stops pods when exceeded.
- **TTL timer** — Pods auto-stop after configurable minutes (default 30).
- **Idle shutdown** — Unused pods stop automatically (default 10 min).
- **No surprise bills** — Cost tracking with per-minute accumulation.

### Quick Setup

1. Get your RunPod API key from [runpod.io/console/user/settings](https://www.runpod.io/console/user/settings)
2. Tell CodIn: _"Connect to RunPod with my API key rp\_..."_
3. Ask: _"What GPUs are available under $1/hr?"_
4. Launch: _"Create a pod with RTX A6000 running PyTorch 2.1"_

**Real API, real compute.** Uses RunPod's actual GraphQL API (`api.runpod.io/graphql`) for pod management and REST `/v2/{endpoint}/run` for serverless inference.

<br/>

---

<br/>

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     CodIn Clients                        │
│  • Desktop shell / Electron app                          │
│  • IDE integration adapter (packages/extension)          │
│  • GUI workflow panels (gui/)                            │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTP + SSE
                          ▼
┌──────────────────────────────────────────────────────────┐
│              CodIn Agent Runtime (:43120)                 │
│  Auth │ Runtime │ i18n │ Research │ MCP │ Run │ Compute  │
│  Swarm │ Routing │ Sessions │ Status │ Pipeline │ Vibe   │
└─────────────────────────┬────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│              Execution & Orchestration                    │
│  • MAS agents and topologies                             │
│  • Compute selector (local/swarm/GPU)                    │
│  • Session manager (isolation + TTL)                     │
│  • Reliability engine (retry/timeout/circuit breaker)    │
│  • Model runtime + external providers                    │
└──────────────────────────────────────────────────────────┘
```

**Route surface:** `auth` · `models` · `runtime` · `i18n` · `research` · `mcp` · `agent-tasks` · `run` · `permissions` · `performance` · `external-providers` · `intelligence` · `compute` · `swarm` · `vibe` · `routing` · `sessions` · `status` · `pipeline`

<br/>

---

<br/>

## 🔄 End-to-End Flow

```
Client action
  → POST /swarm/tasks
  → Agent orchestrates (classify → route → execute)
  → SSE stream from GET /swarm/events
  → Client submits permission decisions (if needed)
  → Results from GET /swarm/tasks/:taskId/results
```

**Validation endpoints:** `GET /api/health` · `GET /status` · `GET /status/compute` · `GET /status/sessions` · `GET /status/agents` · `GET /metrics`

<br/>

---

<br/>

## ⚡ Quick Start

### Prerequisites

- **Node.js** `>=20.19`
- **Python** `>=3.8` (for i18n components)

### 1️⃣ Run Agent Runtime

```bash
cd packages/agent
npm install
npm start
```

```
✅ CodIn Agent listening on http://127.0.0.1:43120
✅ All subsystems loaded
```

### 2️⃣ Verify Health

```bash
curl http://127.0.0.1:43120/api/health
curl http://127.0.0.1:43120/status
curl http://127.0.0.1:43120/status/compute
```

### 3️⃣ Choose Your Interface

| Interface        | Path                                                           |
| :--------------- | :------------------------------------------------------------- |
| 🖥️ Desktop       | [`electron-app/README.md`](electron-app/README.md)             |
| 🧩 IDE Extension | [`packages/extension/README.md`](packages/extension/README.md) |
| 🎨 GUI Panels    | [`gui/README.md`](gui/README.md)                               |
| 🎮 GPU Panel     | Navigate to `/gpu` in the GUI for RunPod management            |

<br/>

---

<br/>

## 🔍 Research API (Serper-Compatible)

```bash
curl -X POST http://127.0.0.1:43120/api/research/serper \
  -H "Content-Type: application/json" \
  -d '{"query":"React hooks tutorial","num_results":5}'
```

| Endpoint                                       | Purpose              |
| :--------------------------------------------- | :------------------- |
| `POST /api/research/serper`                    | General web search   |
| `POST /api/research/web-search`                | Web search           |
| `POST /api/research/fetch-url`                 | Fetch URL content    |
| `POST /api/research/code-documentation-search` | Documentation search |
| `POST /api/research/code-example-search`       | Code examples        |
| `POST /api/research/bug-solution-search`       | Bug solutions        |

<br/>

---

<br/>

## 📁 Repository Map

| Directory            | Purpose                                 |
| :------------------- | :-------------------------------------- |
| `packages/agent`     | Core runtime and orchestration server   |
| `packages/extension` | IDE integration adapter                 |
| `gui`                | Workflow UI panels, chat, and GPU panel |
| `electron-app`       | Standalone CodIn desktop shell          |
| `core`               | Shared engine/runtime modules           |
| `landing`            | Public website and distribution surface |

<br/>

---

<br/>

## 🔒 Security & Reliability

- 🚫 Telemetry-off local-first default
- 🔐 Permission-gated destructive operations
- 📝 Structured audit logging
- ⏱️ Timeout and retry protection in critical agent loops
- ⚡ Circuit-breaker backed LLM/tool execution paths

**Detailed docs:** [`SECURITY.md`](SECURITY.md) · [`SECURITY_AND_INTEGRATION.md`](SECURITY_AND_INTEGRATION.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`BACKEND_API_REFERENCE.md`](BACKEND_API_REFERENCE.md)

<br/>

---

<br/>

## 🧪 Testing

```bash
# All tests
npm test

# Agent-only tests
cd packages/agent
npm test
```

<br/>

---

<br/>

## 🤝 Contributing

- Read [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Follow [`DEVELOPMENT.md`](DEVELOPMENT.md)
- Keep claims in docs aligned with implemented routes and runtime behavior

<br/>

---

<br/>

## 📜 License

Apache 2.0 — see [`LICENSE`](LICENSE)

<br/>

---

<div align="center">

<br/>

**Made with ❤️ by Bharat, for the world** 🇮🇳

<br/>

[![Star on GitHub](https://img.shields.io/badge/⭐_Star_on_GitHub-6366f1?style=for-the-badge&logoColor=white&labelColor=0a0a0f)](https://github.com/inbharat-ai/codein.pro)
[![Report Issue](https://img.shields.io/badge/🐛_Report_Issue-f97316?style=for-the-badge&logoColor=white&labelColor=0a0a0f)](https://github.com/inbharat-ai/codein.pro/issues)
[![Documentation](https://img.shields.io/badge/📖_Documentation-10b981?style=for-the-badge&logoColor=white&labelColor=0a0a0f)](./docs/)

<sub>CodIn is open-source software licensed under Apache 2.0. Free forever.</sub>

</div>
