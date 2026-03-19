# CodeIn v1.0.0-beta — Release Notes (March 2026)

## First Public Beta

CodeIn is an open-source AI coding platform built by Bharat, for the world.
This is the first public beta release — fully functional, locally-run, and free forever.

---

## What's In This Release

### Core AI Features

- **4 AI Modes** — Ask, Plan, Implement, Agent. From gentle suggestions to fully autonomous coding
- **AI Chat & Edit** — Context-aware chat with `@`-mention for files and symbols
- **Smart Autocomplete** — Ghost-text suggestions powered by local or cloud LLMs
- **Autonomous Agent** — Reads files, writes code, runs terminal, self-corrects errors
- **Edit Contracts** — AI produces JSON patches with unified diffs; one-click Apply / Rollback

### Multilingual Intelligence

- **22 Indian Languages** — Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu, Sindhi, Konkani, Manipuri, Dogri, Bodo, Santali, Maithili, Nepali, Sanskrit, Kashmiri
- **Voice Coding** — Speak in any of 22 Indian languages; real-time speech-to-text with TTS readback
- **Hinglish / Code-Mix** — Natural multilingual input normalized to technical English internally

### Local-First & Private

- **Bundled llama.cpp** — Offline inference with no API keys, no cloud, no telemetry
- **Sovereign Mode** — Air-gapped, AES-256 encrypted config for defense/government use
- **60+ LLM Providers** — OpenAI, Anthropic, Google Gemini, Ollama, Mistral, and more (all opt-in)

### Developer Tools

- **Full Git Integration** — Commit, push, pull, branch, merge from a GUI; AI writes commit messages
- **Built-in Web Research** — 6 research modes; search docs, find examples, fetch pages in-editor
- **MCP Tool Protocol** — Connect GitHub, Slack, Jira, Docker, Kubernetes, and hundreds more
- **GPU Panel & RunPod** — Browse GPU types, create pods, submit jobs, track budget via real GraphQL API
- **CLI Agent (`cn`)** — Full coding agent in terminal; interactive TUI + headless mode for CI/CD

### Flagship Features

- **CodeIn Computer** — Local compute engine: give it a goal in any language, it plans, codes, tests, delivers
- **Media Toolkit** — Generate Mermaid/PlantUML diagrams, Stable Diffusion images, and video locally

### Multi-Agent Swarm (MAS)

- 13 autonomous agents with task graphs and 4 coordination topologies
- Circuit breakers, 3-tier memory, fail-closed permission model
- 27 HTTP route modules on localhost:43120

### IDE Shell

- Professional activity bar, status bar, and native Electron menu
- 14+ panels: Chat, History, Search, Swarm, GPU, Git, AI Hub, Computer, Settings

---

## Platform Support

| Platform | Installer                                 | Architecture                        |
| -------- | ----------------------------------------- | ----------------------------------- |
| Windows  | `.exe` (NSIS installer) + Portable `.exe` | x64                                 |
| macOS    | `.dmg`                                    | Intel (x64) + Apple Silicon (arm64) |
| Linux    | `.AppImage` + `.deb` + `.rpm`             | x64                                 |

---

## Known Limitations (Beta)

- GitNexus code graph — in progress
- Computer Use (vision control) — in progress
- Vibe Coding mode — in progress
- IntelliJ/JetBrains plugin — deferred to v1.1
- No usage telemetry = no crash reporting (by design)

---

## Getting Started

1. Download the installer for your platform from the Assets below
2. Run the installer — the local AI engine configures itself on first launch
3. Optionally add cloud API keys in **Settings → Providers**

**Docs:** https://github.com/inbharat-ai/codein.pro/wiki
**Issues:** https://github.com/inbharat-ai/codein.pro/issues
**Discussions:** https://github.com/inbharat-ai/codein.pro/discussions

---

## Checksums

SHA256 checksums for all artifacts are in `SHA256SUMS.txt` (attached below).

---

_Apache-2.0 License · Made with ❤️ in India · By Bharat, for the world_
