<div align="center">

<br/>

<img src="./landing/assets/codein-logo.png" alt="CodeIn" width="120" />

<br/><br/>

# CodeIn

**India's Open-Source AI Coding IDE**

Free &bull; Local-First &bull; 22 Indian Languages &bull; 50+ AI Providers &bull; Multi-Agent Swarm

<br/>

[![License](https://img.shields.io/badge/Apache_2.0-f97316?style=for-the-badge&label=license)](LICENSE)
[![Version](https://img.shields.io/badge/v1.0.0--beta-6366f1?style=for-the-badge&label=version)](https://github.com/inbharat-ai/codein.pro/releases)
[![Stars](https://img.shields.io/github/stars/inbharat-ai/codein.pro?style=for-the-badge&logo=github&color=6366F1)](https://github.com/inbharat-ai/codein.pro)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-10b981?style=for-the-badge)](CONTRIBUTING.md)

<br/>

[**Quick Start**](#-getting-started) &middot; [**Features**](#-features) &middot; [**Languages**](#-language-support) &middot; [**Skills**](#-skills--automation) &middot; [**Architecture**](#-architecture) &middot; [**Contributing**](#-contributing)

</div>

<br/>

## Why CodeIn?

CodeIn is an AI coding IDE built for developers who want full control. 13 autonomous agents plan, code, test, and review together. 50+ LLM providers you swap with your own API keys. Local-first inference via llama.cpp that works fully offline. Write prompts in Hindi, Tamil, Bengali, or any of 22 Indian languages -- CodeIn detects your language and translates to structured English for AI execution.

No cloud dependency. No telemetry. No subscription. Apache 2.0, forever free.

<br/>

## Features

### Core AI Engine

| Feature                    | Description                                                                                                                                                                         |
| :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-Agent Swarm**      | 13 specialized agent types with 4 orchestration topologies (pipeline, fan-out, round-robin, hierarchical). Circuit breakers, 3-tier blackboard memory, audit logging.               |
| **AI Hub (50+ Providers)** | OpenAI, Anthropic, Gemini, Groq, Mistral, Deepseek, Ollama, Azure, Bedrock, Together, Fireworks, OpenRouter, and more. Real-time health monitoring, cost tracking, failover chains. |
| **Local AI (llama.cpp)**   | Fully offline inference with automatic model download. Qwen2.5 Coder 1.5B default. No cloud dependency required.                                                                    |
| **Code Knowledge Graph**   | GitNexus integration for Cypher-queryable code graphs -- impact analysis, execution flow tracing, and hybrid BM25+semantic search.                                                  |
| **Vibe Coding Mode**       | Image-to-UI pipeline: upload a screenshot or describe intent in natural language -- CodeIn generates a UI spec and writes production code autonomously.                             |
| **Autonomous Planner**     | Plan -- Execute -- Test -- Diagnose -- Revise -- Retry loop with configurable retry limits and cost caps.                                                                           |

### Autonomous Execution

| Feature               | Description                                                                                         |
| :-------------------- | :-------------------------------------------------------------------------------------------------- |
| **Computer Use**      | Goal-based autonomous execution with skill discovery, templates, and full audit trails.             |
| **Background Agents** | Run agents on independent tasks in the background. Monitor progress without blocking the main chat. |
| **Web Research**      | Agents autonomously search the web, fetch documentation, and find solutions with response caching.  |
| **Workflow Engine**   | Define reusable multi-step workflows with conditional logic and error recovery.                     |

### Development Tools

| Feature               | Description                                                                                                                          |
| :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| **Docker Sandbox**    | Secure code execution with dropped capabilities, read-only root filesystem, resource limits, network isolation.                      |
| **Git Automation**    | Branching, commits, diffs, staging, and PR creation orchestrated by agents with human approval gates.                                |
| **Terminal Manager**  | Agent-controlled terminal sessions with timeout protection and cross-platform shell support.                                         |
| **Repo Intelligence** | AST-backed symbol finding, call graph analysis, change impact analysis, semantic search, safe multi-file refactoring.                |
| **GPU on Demand**     | Full RunPod integration: browse GPUs, spin up pods (A100, H100, RTX 4090), submit serverless inference jobs with budget enforcement. |

### Editor and UI

| Feature                 | Description                                                                                                                |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **Monaco Editor**       | Full VS Code editor experience with syntax highlighting, IntelliSense, minimap, multi-cursor.                              |
| **Dark + Light Themes** | Professional themes with 50+ CSS custom properties. System follows OS preference.                                          |
| **TipTap Rich Input**   | Rich text input with @mentions, slash commands, code blocks, and file attachments.                                         |
| **MCP Tool Protocol**   | Connect to any MCP server (stdio or HTTP). Tool discovery, argument validation, JSON-RPC 2.0 compliance, full audit trail. |
| **Plugin System**       | Hook-based plugin architecture with timeout protection, priority ordering, and lifecycle management.                       |

<br/>

## Language Support

Most AI coding tools only understand English. CodeIn understands you -- whether you think in Hindi, dream in Tamil, or mix Bengali with Python keywords.

### Tier 1 -- Full Support (11 languages)

UI translation + voice input + unique script detection + TTS

| Language  | Code | Script     |
| :-------- | :--- | :--------- |
| Hindi     | `hi` | Devanagari |
| Bengali   | `bn` | Bengali    |
| Telugu    | `te` | Telugu     |
| Marathi   | `mr` | Devanagari |
| Tamil     | `ta` | Tamil      |
| Gujarati  | `gu` | Gujarati   |
| Kannada   | `kn` | Kannada    |
| Malayalam | `ml` | Malayalam  |
| Punjabi   | `pa` | Gurmukhi   |
| Odia      | `or` | Odia       |
| Assamese  | `as` | Assamese   |

### Tier 2 -- Core Support (11 languages)

UI translation + voice input. Script detection coming soon for languages sharing scripts.

| Language | Code  | Script     | Notes                       |
| :------- | :---- | :--------- | :-------------------------- |
| Urdu     | `ur`  | Nastaliq   | No script detection yet     |
| Sindhi   | `sd`  | Arabic     | No script detection yet     |
| Konkani  | `kok` | Devanagari | Shares Devanagari detection |
| Manipuri | `mni` | Meitei     | No script detection yet     |
| Dogri    | `doi` | Devanagari | Shares Devanagari detection |
| Bodo     | `brx` | Devanagari | Shares Devanagari detection |
| Santali  | `sat` | Ol Chiki   | No script detection yet     |
| Maithili | `mai` | Devanagari | Shares Devanagari detection |
| Nepali   | `ne`  | Devanagari | Shares Devanagari detection |
| Sanskrit | `sa`  | Devanagari | Shares Devanagari detection |
| Kashmiri | `ks`  | Nastaliq   | No script detection yet     |

### English

Full support. Default language.

### Code-Mixed Input

Write how you think. CodeIn handles code-mixed patterns like Hinglish, Benglish, and Tanglish.

| What you type                           | What CodeIn understands                           |
| :-------------------------------------- | :------------------------------------------------ |
| _"login page bana do with Google auth"_ | Create a login page with Google OAuth integration |
| _"is repo ka backend improve karo"_     | Improve the backend of this repository            |
| _"testing likh do is function ke liye"_ | Write tests for this function                     |

### Voice Input and Output

Browser-based speech-to-text for real-time dictation. Backend TTS via gTTS/Azure for high-quality Indian language speech output. Text-to-speech reads AI responses back to you with automatic fallback to browser synthesis.

<br/>

## Skills and Automation

CodeIn ships with two categories of built-in skills that extend agent capabilities beyond raw LLM calls.

### Agent Runtime Skills (12)

Registered in the plugin system, available to all agents. Skills run inside the plugin sandbox with timeout protection (30s default).

| Skill                     | Description                                                 |
| :------------------------ | :---------------------------------------------------------- |
| `generate-commit-message` | LLM-enhanced conventional commit messages from staged diffs |
| `generate-pr-description` | PR summaries from diff content and commit history           |
| `analyze-code`            | Code analysis with actionable improvement suggestions       |
| `lint-check`              | Code linting analysis and style enforcement                 |
| `detect-secrets`          | Scan for hardcoded secrets, API keys, and credentials       |
| `estimate-complexity`     | Cyclomatic complexity estimation for functions and modules  |
| `generate-docs`           | Documentation generation from source code                   |
| `generate-test-file`      | Test file scaffolding with framework-appropriate structure  |
| `search-codebase`         | Semantic code search across the workspace                   |
| `explain-code`            | Code explanation for onboarding and knowledge transfer      |
| `suggest-refactor`        | Refactoring suggestions with pattern-based recommendations  |
| `review-security`         | Security vulnerability scanning (OWASP-aligned)             |

### Claude Code IDE Skills (11)

Located in `.claude/skills/`, these provide domain-specific guidance when using Claude Code as the AI backend.

| Skill                   | Category          | Description                                                        |
| :---------------------- | :---------------- | :----------------------------------------------------------------- |
| `code-reviewer`         | Quality           | Comprehensive code review for React/TypeScript/Node.js             |
| `debug-helper`          | Debugging         | Systematic debugging from reproduction to fix                      |
| `refactor-assistant`    | Refactoring       | Safe, incremental refactoring with test-first workflow             |
| `security-auditor`      | Security          | OWASP-aligned security audit for Node.js/React/Electron            |
| `api-designer`          | Architecture      | REST API design covering resources, errors, pagination, versioning |
| `test-architect`        | Testing           | Testing strategy and patterns for Vitest/Jest + RTL                |
| `performance-optimizer` | Performance       | React, Node.js, and Electron performance optimization              |
| `git-workflow`          | Workflow          | Branching, conventional commits, PR best practices                 |
| `react-component`       | Frontend          | React component design patterns with TypeScript and accessibility  |
| `mcp-builder`           | AI Infrastructure | Build MCP servers with transports, tools, resources, and security  |
| `docs-style`            | Documentation     | Style guidelines for writing and reviewing documentation           |

<br/>

## Architecture

```
CodeIn/
|
|-- packages/agent/              # Core agent runtime (Node.js)
|   |-- src/
|   |   |-- index.js             #   HTTP server (28 route modules)
|   |   |-- mas/                 #   Multi-Agent Swarm engine
|   |   |   |-- swarm-manager.js #     Orchestrator (4 topologies)
|   |   |   |-- agents/          #     13 agent implementations
|   |   |   |-- memory.js        #     3-tier blackboard memory
|   |   |   +-- permissions.js   #     Fail-closed permission gate
|   |   |-- routes/              #   28 HTTP route modules
|   |   |-- ai-hub/              #   Multi-provider AI management
|   |   |-- mcp/                 #   MCP client manager
|   |   |-- gpu-orchestration/   #   RunPod GPU provider
|   |   +-- security/            #   Sandbox, validators, rate limiter
|   +-- test/                    #   193 test suites, 1,788 tests
|
|-- gui/                         # React 18 + Redux Toolkit + Vite 6
|   +-- src/                     #   466 source files, 68 test files
|
|-- electron-app/                # Electron 28 desktop shell
|-- core/                        # Shared TypeScript types
|-- packages/extension/          # VS Code / JetBrains adapter
+-- landing/                     # Public website
```

**Client Layer:** Electron desktop app, VS Code/JetBrains extension, React web GUI -- all communicate with the agent runtime over HTTP + SSE.

**Agent Runtime (localhost:43120):** 28 route modules behind JWT auth, rate limiting, input validation, and prompt injection detection.

**Multi-Agent Swarm:** 13 agent types coordinated through 4 topologies. 3-tier memory (working, blackboard, persistent via SQLite). Circuit breakers, permission gates, and audit logging.

**AI and Compute:** Local inference via llama.cpp, 50+ cloud providers, RunPod GPU on demand with budget enforcement.

<br/>

## Getting Started

> **Prerequisites:** Node.js 20.19+ and npm 10+

### 1. Clone and Install

```bash
git clone https://github.com/inbharat-ai/codein.pro.git
cd CodeIn
npm install
```

### 2. Start the Agent Runtime

```bash
cd packages/agent
npm start
# CodeIn Agent listening on http://127.0.0.1:43120
```

### 3. Launch the App

```bash
# Desktop app (recommended)
cd electron-app && npm run dev

# Or web GUI
cd gui && npm run dev
```

### 4. Verify

```bash
curl http://127.0.0.1:43120/api/v1/health
# { "status": "ok", "uptime": 42, ... }
```

### Download Pre-Built Binaries

| Platform    | Download                                                                      |
| :---------- | :---------------------------------------------------------------------------- |
| **Windows** | [CodeIn-Setup.exe](https://github.com/inbharat-ai/codein.pro/releases/latest) |
| **macOS**   | [CodeIn.dmg](https://github.com/inbharat-ai/codein.pro/releases/latest)       |
| **Linux**   | [CodeIn.AppImage](https://github.com/inbharat-ai/codein.pro/releases/latest)  |

All releases: [github.com/inbharat-ai/codein.pro/releases](https://github.com/inbharat-ai/codein.pro/releases)

<br/>

## Security

CodeIn follows a defense-in-depth security model:

- **Fail-closed permissions** -- every destructive operation requires explicit user approval
- **JWT authentication** with configurable secrets
- **Prompt injection detection** via pattern matching and structural heuristics
- **Input validation** -- shell metacharacter blocking, path traversal prevention
- **Docker sandbox** -- dropped capabilities, read-only root, resource limits, network isolation
- **Audit logging** -- every agent action logged with timestamp, agent ID, and rationale
- **Rate limiting** -- sliding-window per-key rate limiter on all endpoints
- **Secret redaction** -- API keys automatically masked in logs and SSE streams
- **Zero telemetry** -- no tracking, no analytics, no phone-home

See [`SECURITY.md`](SECURITY.md) for full details and responsible disclosure policy.

<br/>

## Testing

| Package          | Runner                   |  Suites |     Tests |
| :--------------- | :----------------------- | ------: | --------: |
| `packages/agent` | Node.js test runner      |     193 |     1,788 |
| `gui`            | Vitest + Testing Library |      68 |       641 |
| **Total**        |                          | **261** | **2,429** |

```bash
cd packages/agent && npm test      # Agent runtime tests
cd gui && npx vitest run           # GUI tests
cd gui && npx tsc --noEmit         # Type check
```

<br/>

## Contributing

We welcome contributions -- bug fixes, new features, new language support, documentation improvements.

1. **Fork** the repository
2. **Branch** -- `git checkout -b feature/amazing-feature`
3. **Commit** -- `git commit -m 'feat: add amazing feature'`
4. **Push** -- `git push origin feature/amazing-feature`
5. **Open** a Pull Request

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`DEVELOPMENT.md`](DEVELOPMENT.md) for conventions and setup guides.

<br/>

## License

[Apache 2.0](LICENSE) -- free to use, modify, and distribute.

<br/>

## Contact

**Built by [inBharat AI](https://github.com/inbharat-ai)**

Email: [info@inbharat.ai](mailto:info@inbharat.ai)

<br/>

---

<div align="center">

<br/>

<img src="./landing/assets/codein-logo.png" alt="CodeIn" width="48"/>

<br/><br/>

**Your code, your language, your machine.**

<br/>

[![Star CodeIn](https://img.shields.io/github/stars/inbharat-ai/codein.pro?style=for-the-badge&logo=github&label=Star%20CodeIn&color=6366F1)](https://github.com/inbharat-ai/codein.pro)

</div>
