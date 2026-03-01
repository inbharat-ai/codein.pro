# 🚀 CodIn - AI-Powered Code Intelligence Platform

<div align="center">

![CodIn](https://img.shields.io/badge/CodIn-v0.1.0-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-20.19+-green?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=for-the-badge&logo=typescript)

**World-class AI coding assistant with inbuilt web research, multilingual support, and local model runtime**

</div>

---

## 🌟 Highlights

### 🆕 **Inbuilt Web Research** (No External APIs Required!)

- ✅ **Serper-compatible search** - Drop-in replacement without API keys
- ✅ **6 research endpoints** - web-search, fetch-url, code-docs, examples, bugs, serper
- ✅ **DuckDuckGo fallback** - Zero configuration required
- ✅ **Smart caching** - 5-minute TTL for faster repeat queries
- ✅ **Activity logging** - Track all research operations

### 🤖 **AI-Powered Development**

- **4 Modes**: Ask (chat), Plan (structured), Agent (autonomous), Implement (edit contracts)
- **Edit Safety**: Preview, apply, and rollback with backup system
- **Local Models**: Built-in GGUF model manager (Qwen2.5, DeepSeek R1)
- **Context-aware**: Uses current file/selection for relevant suggestions

### 🌐 **Multilingual Support**

- **Voice INPUT**: Hindi, Assamese, Tamil, English speech-to-text
- **AI4Bharat**: Indic language translation
- **Native names**: हिन्दी, অসমীয়া, தமிழ், English
- **Real-time switching**: Change language mid-conversation

### 🛠️ **Developer Tools**

- **Debug Panel**: Inspect errors, logs, and stack traces
- **Research Panel**: Web search from IDE
- **Run Panel**: Auto-detect and execute dev servers
- **Git Actions**: Status, commit, push with permissions
- **Deploy Helpers**: Generate Vercel/Netlify/Firebase configs
- **MCP Integration**: Model Context Protocol support

### 🔒 **Privacy & Security**

- **Offline-First**: Works without internet using local models
- **Permission System**: 8 categories with workspace-level control
- **Activity Logging**: JSONL format for audit trails
- **No Telemetry**: Privacy-first, no tracking by default

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20.19 or higher
- **Python** 3.8+ (for i18n service)
- **VS Code** 1.80+

### Installation

1. Clone this repository:

   ```bash
   git clone <your-fork>
   cd "Bharta Code"
   ```

2. Install dependencies:

   ```bash
   npm install
   cd gui
   npm install
   cd ..
   ```

3. Start the CodIn Agent:

   ```bash
   cd packages/agent
   npm start
   ```

   **Expected output:**

   ```
   CodIn Agent listening on http://127.0.0.1:43120
   [CodIn Agent] All subsystems loaded
   ```

4. Build the extension:

   ```bash
   cd packages/extension
   npm install
   npm run esbuild
   ```

5. Launch in VS Code:
   - Open the workspace in VS Code
   - Press `F5` to start debugging
   - A new Extension Development Host window will open

### Test Serper-like Search

```bash
# Quick test
curl -X POST http://localhost:43120/api/research/serper \
  -H "Content-Type: application/json" \
  -d '{"query": "React hooks tutorial", "num_results": 5}'
```

**Response:**

```json
{
  "data": {
    "searchParameters": {
      "q": "React hooks tutorial",
      "type": "search",
      "engine": "codin"
    },
    "organic": [
      {
        "position": 1,
        "title": "React Hooks – React",
        "link": "https://react.dev/reference/react/hooks",
        "snippet": "Hooks let you use different React features...",
        "source": "CodIn Search"
      }
    ]
  }
}
```

### First Use

1. **Open Chat**: Press `Ctrl+L` (or `Cmd+L` on Mac)
2. **Select Mode**: Use the mode selector above the input
3. **Ask a Question**: Type your query and press Enter
4. **View Settings**: Click the gear icon to configure models, git, etc.

---

## 🔍 Web Research System

CodIn includes a powerful **inbuilt web research system** with **NO external API keys required**!

### Serper-Compatible Search (NEW!)

Replace expensive Serper API with CodIn's free, inbuilt alternative:

```javascript
// JavaScript/Node.js
const response = await fetch("http://localhost:43120/api/research/serper", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "Next.js server actions",
    num_results: 5,
  }),
});

const data = await response.json();
console.log(data.data.organic); // Array of search results
```

### Available Endpoints

1. **`POST /api/research/serper`** - Serper-compatible search (Recommended!)
2. **`POST /api/research/web-search`** - General web search
3. **`POST /api/research/fetch-url`** - Fetch and parse URL content
4. **`POST /api/research/code-documentation-search`** - Find official docs
5. **`POST /api/research/code-example-search`** - Search code examples
6. **`POST /api/research/bug-solution-search`** - Find bug solutions

### Search Providers (Automatic Fallback)

CodIn automatically selects the best available provider:

1. **Tavily** (if `CODIN_TAVILY_API_KEY` is set) - Best results
2. **Brave** (if `CODIN_BRAVE_API_KEY` is set) - Fast and reliable
3. **SerpAPI** (if `CODIN_SERPAPI_KEY` is set) - Google results
4. **DuckDuckGo** (default) - **No API key required!** ✨

### Features

- ✅ **Zero configuration** - Works out of the box
- ✅ **Smart caching** - 5-minute TTL for faster repeat queries
- ✅ **Activity logging** - Track all research operations
- ✅ **Permission system** - webFetch permission required
- ✅ **Serper-compatible** - Drop-in replacement

**See [docs/WEB_RESEARCH.md](./docs/WEB_RESEARCH.md) for comprehensive documentation.**

---

## 📖 Usage

### Modes

- **Ask**: Open-ended chat with code context
- **Plan**: Structured planning for complex tasks
- **Agent**: Autonomous multi-step execution
- **Implement**: Strict JSON edit contracts with preview

Switch modes using the selector above the chat input.

### Implement Mode (Deterministic Edits)

1. Select "Implement" mode
2. Describe your desired changes
3. Review the JSON contract in the preview panel
4. Click "Apply" to execute changes (with automatic backup)
5. If needed, click "Rollback" to undo

### Model Manager

1. Open Settings (gear icon) → Models
2. View currently active models
3. Import local GGUF models or configure cloud APIs
4. Switch between local and cloud providers

### Voice Input

1. Click the microphone icon below the chat input
2. Select your language (Hindi/Assamese/Tamil/English)
3. Grant microphone permission when prompted
4. Speak your query

### Run Panel

1. Open Settings → Run
2. View auto-detected project type and command
3. Click "Run" to start dev server (permission required)
4. Click "Open Preview" to view in browser

### Git Actions

1. Open Settings → Git
2. View current branch and uncommitted changes
3. Enter commit message and click "Commit"
4. Click "Push" to push to remote (permission required)

### Deploy Helpers

1. Open Settings → Deploy
2. Click Vercel, Netlify, or Firebase
3. Config files are generated automatically
4. Follow the provided deployment instructions

## 🏗️ Architecture

CodIn consists of three main packages plus comprehensive tooling:

### Core Packages

- **`packages/extension`**: VS Code extension UI, commands, and IDE integration
- **`packages/agent`**: CodIn Agent HTTP service (Node.js)
  - `src/research/` - Web research system with Serper-like endpoint
  - `src/i18n/` - Multilingual support (AI4Bharat)
  - `src/mcp/` - Model Context Protocol integration
  - `src/run/` - Task manager and process management
  - `src/model-runtime/` - Local LLM runtime (llama.cpp)
- **`packages/shared`**: Shared schemas, validation, and utilities
  - `src/permissions/` - Permission system (8 categories)
- **`gui/`**: React components for UI
  - `src/components/` - CopilotChat, ResearchPanel, DebugPanel, etc.

### System Architecture

```
┌──────────────────────────────────────────┐
│         VS Code Extension                │
│  ┌────────────┐  ┌──────────────┐        │
│  │ CopilotChat│  │ ResearchPanel│        │
│  └──────┬─────┘  └──────┬───────┘        │
│         └────────────────┘                │
│                ↓                          │
│        HTTP/WebSocket Client              │
└────────────────┼─────────────────────────┘
                 │
                 ↓
┌──────────────────────────────────────────┐
│    CodIn Agent (Port 43120)              │
│  ┌───────────────────────────────┐       │
│  │  Web Research System          │       │
│  │  /api/research/serper  ✨     │       │
│  │  /api/research/web-search     │       │
│  └──────────┬────────────────────┘       │
│             ↓                             │
│  ┌──────────────────────────────┐        │
│  │ Provider Selection           │        │
│  │ 1. Tavily (optional)         │        │
│  │ 2. Brave (optional)          │        │
│  │ 3. SerpAPI (optional)        │        │
│  │ 4. DuckDuckGo (default) ✅   │        │
│  └──────────────────────────────┘        │
│                                           │
│  ┌──────────────────────────────┐        │
│  │ Task Manager + Permissions   │        │
│  └──────────────────────────────┘        │
└──────────────────────────────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture overview.

## 🔒 Privacy & Security

- **Telemetry OFF by default**: No usage tracking unless explicitly enabled
- **No API key logging**: Keys stored securely in VS Code secret storage
- **Permission gates**: Run, git, and deploy actions require explicit confirmation
- **Local-first**: Full functionality with local models (no internet required)
- **Edit backups**: All file changes backed up before applying

See [SECURITY.md](SECURITY.md) for security details.

## 🧪 Testing

Run unit tests:

```bash
npm test
```

See [TESTING.md](TESTING.md) for comprehensive testing guide.

## 🛠️ Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for:

- Project structure
- Development workflow
- Debugging guide
- Common tasks
- Release process

## 📝 Documentation

### Core Guides

- [README.md](README.md) - This file (Getting Started)
- [WEB_RESEARCH.md](./docs/WEB_RESEARCH.md) - **⭐ Web research system & Serper API**
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [DEVELOPMENT.md](DEVELOPMENT.md) - Developer guide
- [TESTING.md](TESTING.md) - Testing guide
- [SECURITY.md](SECURITY.md) - Security & privacy
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [CHANGELOG.md](CHANGELOG.md) - Version history

### API Documentation

- [REST API Reference](./docs/API_REFERENCE.md) - All HTTP endpoints
- [Permission System](./docs/PERMISSIONS.md) - Security model
- [Task Manager](./docs/TASK_MANAGER.md) - Background execution

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

Apache 2.0 - see [LICENSE](./LICENSE) for details

---

## 🙏 Acknowledgments

CodIn is built on top of excellent open-source technologies:

- **llama.cpp** - Lightning-fast local model runtime
- **AI4Bharat** - World-class Indic language translation
- **DuckDuckGo** - Privacy-focused search without API keys
- **VS Code** - Powerful extension platform
- **React** - Modern UI framework
- **Node.js** - Fast and scaleable runtime

Special thanks to the Continue project for inspiring our initial architecture.

---

<div align="center">

**Made with ❤️ by the CodIn Team**

[⭐ Star on GitHub](#) • [📖 Documentation](./docs/) • [🐛 Report Issues](#)

**CodIn - Code Smarter, Search Freely, Build Faster**

</div>
