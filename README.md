<div align="center">

<br/>

<img src="./landing/assets/codein-logo.png" alt="CodIn" width="140" />

<br/><br/>

<!-- Animated Typing SVG -->
<a href="https://github.com/inbharat-ai/codein.pro">
<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&pause=1000&color=6366F1&center=true&vCenter=true&multiline=true&repeat=true&width=600&height=35&lines=The+Open-Source+AI+Coding+IDE+Built+for+Bharat+%F0%9F%87%AE%F0%9F%87%B3" alt="Typing SVG" />
</a>

<br/><br/>

<!-- Badge Row -->

[![Version](https://img.shields.io/badge/v1.0.0-6366f1?style=for-the-badge&label=version)](https://github.com/inbharat-ai/codein.pro/releases)
[![Tests](https://img.shields.io/badge/1256_passing-10b981?style=for-the-badge&logo=jest&logoColor=white&label=tests)](packages/agent/test/)
[![License](https://img.shields.io/badge/Apache_2.0-f97316?style=for-the-badge&label=license)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-6366f1?style=for-the-badge)](CONTRIBUTING.md)

<br/>

<!-- Tech badges -->

![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_20-339933?style=flat-square&logo=node.js&logoColor=white)
![Redux](https://img.shields.io/badge/Redux_Toolkit-764ABC?style=flat-square&logo=redux&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)

<br/>

[**Get Started**](#-quick-start) &nbsp;·&nbsp; [**Features**](#-features) &nbsp;·&nbsp; [**Architecture**](#%EF%B8%8F-architecture) &nbsp;·&nbsp; [**Multi-Agent Swarm**](#-multi-agent-swarm) &nbsp;·&nbsp; [**Contributing**](#-contributing)

</div>

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## What is CodIn?

**CodIn** (कोडइन) is a free, open-source AI coding IDE that combines **Cursor/Copilot-class workflows** with a multi-agent swarm system, 50+ LLM providers, local-first inference via llama.cpp, and multilingual intelligence for **19 Indian languages** — all under Apache 2.0.

<div align="center">

> _"Your code, your language, your machine."_

</div>

Not just autocomplete — CodIn is a **full AI engineering system** with autonomous task planning, multi-agent orchestration, Docker sandboxing, Git workflow automation, and a real-time permission loop. Every AI action is auditable, cancellable, and runs locally by default.

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## At a Glance

<div align="center">

<table>
<tr>
<td align="center"><h3>🤖</h3><b>13</b><br/><sub>Agent Types</sub></td>
<td align="center"><h3>🧪</h3><b>1,256</b><br/><sub>Tests Passing</sub></td>
<td align="center"><h3>🔌</h3><b>50+</b><br/><sub>LLM Providers</sub></td>
<td align="center"><h3>🌐</h3><b>19</b><br/><sub>Indian Languages</sub></td>
<td align="center"><h3>🛡️</h3><b>26</b><br/><sub>Route Modules</sub></td>
<td align="center"><h3>💰</h3><b>$0</b><br/><sub>Forever Free</sub></td>
</tr>
</table>

</div>

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Features

<details open>
<summary><b>Full Feature List</b></summary>

<br/>

| Category                | Capabilities                                                                                                                                                                                                                          |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Multi-Agent Swarm**   | 13 agent types (planner, coder, debugger, tester, architect, security, docs, reviewer, refactorer, devops, i18n, vibe-builder, browser), 4 topologies (pipeline, fan-out, round-robin, hierarchical), circuit breakers, 3-tier memory |
| **AI Hub**              | 50+ providers: OpenAI, Anthropic, Gemini, Groq, Mistral, Deepseek, Ollama, Azure, Bedrock, Together, Fireworks, OpenRouter, and more. Real-time health monitoring, model browser, cost tracking                                       |
| **Local AI**            | llama.cpp integration for fully offline inference. No mandatory cloud dependency                                                                                                                                                      |
| **Vibe Coding**         | Describe intent in natural language → CodIn plans, generates, refactors, validates, and iterates across files                                                                                                                         |
| **Autonomous Planner**  | plan → execute → test → diagnose → revise → retry loop with configurable retry limits                                                                                                                                                 |
| **Docker Sandbox**      | Secure code execution with capability dropping, read-only root, resource limits, network isolation                                                                                                                                    |
| **Git Workflow**        | Automated branching, commits, diffs, staging — all through the swarm agent                                                                                                                                                            |
| **Terminal Manager**    | Agent-controlled terminal sessions with timeout, history recording, cross-platform shell support                                                                                                                                      |
| **Multilingual**        | 19 Indian language detection (10 with full technical term preservation). Hinglish, Benglish, Tanglish code-mixed input normalized to English for AI execution                                                                         |
| **Plugin System**       | Hook-based plugins with timeout protection, priority ordering, remote plugin protocol with heartbeat                                                                                                                                  |
| **SQLite Persistence**  | Task queue, memory store, analytics — with graceful fallback to in-memory when SQLite unavailable                                                                                                                                     |
| **Compute Routing**     | Local → Swarm → GPU (RunPod) escalation with budget guardrails and session TTL                                                                                                                                                        |
| **MCP Tools**           | Connect to GitHub, Slack, Jira, Docker, Kubernetes, RunPod GPU — 10 built-in MCP tools                                                                                                                                                |
| **Security**            | Fail-closed permissions, JWT auth, prompt injection detection, input validation, audit logging, sandbox isolation                                                                                                                     |
| **Real-time Streaming** | SSE event stream for all agent actions, permission requests, and task progress                                                                                                                                                        |
| **Zero Telemetry**      | No tracking, no analytics, no phone-home. 100% private by default                                                                                                                                                                     |

</details>

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## CodIn vs. Paid Tools

<div align="center">

| Feature                               |   **CodIn**    | Cursor ($20/mo) | Copilot ($10/mo) | Windsurf ($15/mo) |
| :------------------------------------ | :------------: | :-------------: | :--------------: | :---------------: |
| AI Code Completion                    |    **Yes**     |       Yes       |       Yes        |        Yes        |
| AI Chat & Agent Mode                  |    **Yes**     |       Yes       |       Yes        |        Yes        |
| **Multi-Agent Swarm (13 agents)**     |    **Yes**     |       No        |        No        |        No         |
| **100% Free & Open Source**           |    **Yes**     |       No        |        No        |        No         |
| **Local AI via llama.cpp**            |    **Yes**     |       No        |        No        |        No         |
| **50+ LLM Providers (BYO key)**       |    **Yes**     |        ~        |        No        |         ~         |
| **19 Indian Language Detection**      |    **Yes**     |       No        |        No        |        No         |
| **Docker Sandbox Execution**          |    **Yes**     |       No        |        No        |        No         |
| **Autonomous Plan-Execute-Test Loop** |    **Yes**     |       No        |        No        |        No         |
| MCP Tool Protocol                     |      Yes       |       Yes       |        ~         |        Yes        |
| Zero Telemetry                        |    **Yes**     |       No        |        No        |        No         |
| **Price**                             | **$0 forever** |     $20/mo      |      $10/mo      |      $15/mo       |

</div>

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Multi-Agent Swarm

CodIn's MAS (Multi-Agent Swarm) is the core orchestration engine. It's not a wrapper around a single LLM — it coordinates **specialized agents** working together on complex tasks.

```
User: "Add JWT auth to this Express API with tests"

  Planner Agent    → Breaks into subtasks: middleware, routes, tests
  Architect Agent  → Designs auth flow, picks dependencies
  Coder Agent      → Implements middleware + route guards
  Tester Agent     → Writes and runs test suite
  Reviewer Agent   → Reviews code quality, flags issues
  Security Agent   → Audits for OWASP vulnerabilities

  All coordinated through pipeline topology with shared blackboard memory.
```

### Agent Types

| Agent          | Role                                           |
| :------------- | :--------------------------------------------- |
| `PLANNER`      | Decomposes tasks into execution plans          |
| `CODER`        | Writes and modifies code                       |
| `DEBUGGER`     | Diagnoses and fixes bugs                       |
| `TESTER`       | Generates and runs tests                       |
| `REFACTORER`   | Improves code quality and structure            |
| `ARCHITECT`    | Designs system architecture                    |
| `DEVOPS`       | Infrastructure and deployment                  |
| `SECURITY`     | Security auditing and hardening                |
| `DOCS`         | Documentation generation                       |
| `REVIEWER`     | Code review and quality gates                  |
| `I18N`         | Internationalization support                   |
| `VIBE_BUILDER` | Natural language → full feature implementation |
| `BROWSER`      | Web interaction and research (LLM-simulated)   |

### Topologies

| Topology         | Use Case                                                   |
| :--------------- | :--------------------------------------------------------- |
| **Pipeline**     | Sequential agent chain: plan → code → test → review        |
| **Fan-out**      | Parallel execution: multiple coders working simultaneously |
| **Round-robin**  | Load-balanced task distribution                            |
| **Hierarchical** | Manager agent delegates to specialist sub-agents           |

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Multilingual Intelligence

<div align="center">

> CodIn detects your language via Unicode script analysis, preserves technical terms,
> and normalizes multilingual input into structured English for AI execution.

</div>

<table>
<tr>
<th align="center">What you say</th>
<th align="center">What CodIn understands</th>
</tr>
<tr>
<td><b>"login page bana do with Google auth"</b></td>
<td><b>"Create a login page with Google OAuth integration"</b></td>
</tr>
<tr>
<td><i>"is repo ka backend improve karo"</i></td>
<td><i>"Improve the backend of this repository"</i></td>
</tr>
<tr>
<td><i>"dashboard ko aur clean banao"</i></td>
<td><i>"Clean up and improve the dashboard UI"</i></td>
</tr>
</table>

<br/>

**Supported Languages:**

<div align="center">

<table>
<tr>
<td align="center"><b>Language</b></td><td align="center"><b>Script</b></td><td></td>
<td align="center"><b>Language</b></td><td align="center"><b>Script</b></td><td></td>
<td align="center"><b>Language</b></td><td align="center"><b>Script</b></td>
</tr>
<tr><td>Hindi</td><td>Devanagari</td><td></td><td>Bengali</td><td>Bengali</td><td></td><td>Tamil</td><td>Tamil</td></tr>
<tr><td>Telugu</td><td>Telugu</td><td></td><td>Marathi</td><td>Devanagari</td><td></td><td>Gujarati</td><td>Gujarati</td></tr>
<tr><td>Kannada</td><td>Kannada</td><td></td><td>Malayalam</td><td>Malayalam</td><td></td><td>Punjabi</td><td>Gurmukhi</td></tr>
<tr><td>Assamese</td><td>Assamese</td><td></td><td>Odia</td><td>Odia</td><td></td><td>Urdu</td><td>Nastaliq</td></tr>
<tr><td>Sindhi</td><td>Arabic</td><td></td><td>Konkani</td><td>Devanagari</td><td></td><td>Manipuri</td><td>Meitei</td></tr>
<tr><td>Dogri</td><td>Devanagari</td><td></td><td>Bodo</td><td>Devanagari</td><td></td><td>Santali</td><td>Ol Chiki</td></tr>
</table>

Plus code-mixed patterns: **Hinglish** · **Benglish** · **Tanglish** and more.

</div>

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Architecture

```
+---------------------------------------------------------+
|                    CodIn Clients                        |
|  Electron Desktop  |  IDE Extension  |  GUI Panels     |
+--------------------+--------+--------+-----------------+
                              | HTTP + SSE
                              v
+---------------------------------------------------------+
|           CodIn Agent Runtime (:43120)                  |
|                                                         |
|  26 Route Modules:                                      |
|  auth | models | runtime | i18n | research | mcp |      |
|  swarm | vibe | compute | sessions | pipeline | ...     |
+---------------------------------------------------------+
                              |
                              v
+---------------------------------------------------------+
|          Multi-Agent Swarm Engine                       |
|                                                         |
|  13 Agent Types  |  4 Topologies  |  Plugin System      |
|  Blackboard Memory  |  Permission Gate  |  Audit Log    |
|  SQLite Persistence  |  Circuit Breaker  |  Sandbox     |
+---------------------------------------------------------+
                              |
              +---------------+---------------+
              v               v               v
        +-----------+   +-----------+   +-----------+
        | Local AI  |   | Cloud AI  |   | GPU Cloud |
        | llama.cpp |   | 50+ LLMs  |   | RunPod    |
        +-----------+   +-----------+   +-----------+
```

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Quick Start

> **Prerequisites:** Node.js 20.19+ &nbsp;·&nbsp; npm 10+

### 1. Clone & Install

<table>
<tr>
<td width="50%">

**macOS / Linux**

```bash
git clone https://github.com/inbharat-ai/codein.pro.git
cd codein.pro
npm install
```

</td>
<td width="50%">

**Windows (PowerShell)**

```powershell
git clone https://github.com/inbharat-ai/codein.pro.git
cd codein.pro
npm install
```

</td>
</tr>
</table>

### 2. Start the Agent Runtime

```bash
cd packages/agent
npm start
```

```
  CodIn Agent listening on http://127.0.0.1:43120
  All subsystems loaded
```

### 3. Verify

```bash
curl http://127.0.0.1:43120/api/health
curl http://127.0.0.1:43120/status
```

### 4. Choose Your Interface

| Interface     | Path                                                  | Description                            |
| :------------ | :---------------------------------------------------- | :------------------------------------- |
| Desktop       | [`electron-app/`](electron-app/README.md)             | Standalone Electron app                |
| IDE Extension | [`packages/extension/`](packages/extension/README.md) | VS Code / JetBrains integration        |
| GUI Panels    | [`gui/`](gui/README.md)                               | React workflow UI with swarm dashboard |

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## AI Hub — 50+ Providers

CodIn's AI Hub lets you bring your own API key and use any model you prefer:

<div align="center">

<table>
<tr>
<td align="center">

**Cloud AI**<br/>
OpenAI · Anthropic · Gemini<br/>Groq · Mistral · Deepseek · xAI

</td>
<td align="center">

**Hosted Inference**<br/>
Together · Fireworks · Replicate<br/>SambaNova · Cerebras · OpenRouter

</td>
<td align="center">

**Local / Self-Hosted**<br/>
Ollama · LM Studio · llama.cpp<br/>Llamafile · vLLM · TGI

</td>
<td align="center">

**Enterprise**<br/>
Azure OpenAI · AWS Bedrock<br/>Google VertexAI · Nvidia NIM

</td>
</tr>
</table>

</div>

Real-time health monitoring, automatic model discovery, cost tracking per agent/model, and streaming support for all providers.

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Security

<div align="center">

| Layer                       | Details                                                                                          |
| :-------------------------- | :----------------------------------------------------------------------------------------------- |
| **Fail-Closed Permissions** | Every destructive operation requires explicit user approval. No silent actions.                  |
| **Docker Sandbox**          | Code execution in isolated containers with dropped capabilities, read-only root, resource limits |
| **Input Validation**        | Shell metacharacter blocking, path traversal prevention, printable ASCII enforcement             |
| **JWT Authentication**      | Token-based auth with configurable secrets. Dev mode available for local use                     |
| **Prompt Injection Guard**  | Pattern matching + structural heuristics to detect injection attempts                            |
| **Audit Logging**           | Every agent action logged with timestamp, agent ID, and decision rationale                       |
| **Rate Limiting**           | Sliding-window per-key rate limiter on all public endpoints                                      |
| **Secret Redaction**        | API keys automatically masked in logs and error messages                                         |

</div>

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Repository Structure

<details>
<summary><b>Full Project Structure (click to expand)</b></summary>

<br/>

```
codein.pro/
│
├── packages/agent/              # Core agent runtime (Node.js)
│   ├── src/
│   │   ├── mas/                 # Multi-Agent Swarm engine
│   │   │   ├── swarm-manager.js #   Orchestrator (topologies, lifecycle)
│   │   │   ├── agents/          #   13 agent implementations
│   │   │   ├── memory.js        #   3-tier blackboard memory
│   │   │   ├── permissions.js   #   Fail-closed permission gate
│   │   │   ├── autonomous-planner.js  # Plan-execute-test loop
│   │   │   ├── docker-sandbox.js      # Secure container execution
│   │   │   ├── git-workflow.js        # Git automation
│   │   │   ├── terminal-manager.js    # Agent-controlled terminals
│   │   │   ├── sqlite-store.js        # Persistent storage
│   │   │   ├── plugin-system.js       # Hook-based plugins
│   │   │   └── plugin-hooks.js        # Plugin lifecycle hooks
│   │   ├── routes/              # 26 HTTP route modules
│   │   ├── ai-hub/              # Multi-provider AI management
│   │   │   ├── hub-manager.js   #   Provider orchestration
│   │   │   ├── provider-registry.js   # Key + health tracking
│   │   │   └── adapters/        #   OpenAI-compat, Gemini adapters
│   │   ├── security/            # Sandbox worker, validators
│   │   └── utils/               # Rate limiter, secret redaction
│   └── test/                    # 93 test suites, 1256 tests
│
├── gui/                         # React 18 + Redux Toolkit + Vite
│   ├── src/components/
│   │   ├── SwarmPanel/          # Swarm dashboard (8 sub-panels)
│   │   ├── AIHubPanel/          # AI provider management UI
│   │   ├── Chat/                # AI chat interface
│   │   └── ComputePanel/        # GPU & compute management
│   ├── src/redux/               # State management (slices + thunks)
│   └── src/i18n/                # Internationalization (en, hi)
│
├── electron-app/                # Electron desktop shell
├── core/                        # Shared engine/runtime modules
├── packages/extension/          # VS Code / JetBrains adapter
├── landing/                     # Public website
│
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE                      # Apache 2.0
└── CLAUDE.md                    # AI assistant instructions
```

</details>

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Testing

```bash
cd packages/agent
npm test
```

```
Test Suites: 92 passed, 1 skipped, 93 total
Tests:       1256 passed, 1 skipped, 1257 total
```

93 test suites covering: swarm orchestration, agent lifecycle, HTTP routes, security validators, SQLite persistence, AI Hub adapters, plugin system, terminal management, load/stress scenarios, and end-to-end pipelines.

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## GPU on Demand — RunPod Integration

CodIn connects to [RunPod](https://www.runpod.io/) via MCP for on-demand GPU compute:

| Tool                   | What it does                            |
| :--------------------- | :-------------------------------------- |
| `runpod_connect`       | Store your RunPod API key securely      |
| `runpod_list_gpus`     | Browse available GPUs with live pricing |
| `runpod_create_pod`    | Spin up an on-demand GPU pod            |
| `runpod_stop_pod`      | Stop pod (keeps volume for later)       |
| `runpod_terminate_pod` | Destroy pod + volume permanently        |
| `runpod_run_job`       | Submit serverless inference jobs        |

**Safety:** Budget cap (default $100/session), TTL timer (auto-stop after 30 min), idle shutdown (10 min), per-minute cost tracking.

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## Contributing

<div align="center">

**We welcome contributions!** Bug fixes, new features, new language support, documentation improvements.

</div>

1. **Fork** the repository
2. **Branch** — `git checkout -b feature/amazing-feature`
3. **Commit** — `git commit -m 'Add amazing feature'`
4. **Push** — `git push origin feature/amazing-feature`
5. **Open** a Pull Request

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`DEVELOPMENT.md`](DEVELOPMENT.md) for conventions and setup guides.

<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&customColorList=12,14,20&height=2&section=header" width="100%"/>

<br/>

## License

Apache 2.0 — see [`LICENSE`](LICENSE) for details.

<br/>

---

<div align="center">

<br/>

<img src="./landing/assets/codein-logo.png" alt="CodIn" width="48"/>

<br/>

**Built with love for Bharat by [InBharat AI](https://github.com/inbharat-ai)**

_Making AI coding accessible to everyone, in every language_

<br/>

[![Star this repo](https://img.shields.io/github/stars/inbharat-ai/codein.pro?style=for-the-badge&logo=github&label=Star%20CodIn&color=6366F1)](https://github.com/inbharat-ai/codein.pro)

<br/>

![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Redux](https://img.shields.io/badge/Redux-764ABC?style=flat-square&logo=redux&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat-square&logo=jest&logoColor=white)

<sub>If CodIn helps you, give it a star — it means the world to us!</sub>

</div>

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12,14,20&height=100&section=footer" width="100%"/>
