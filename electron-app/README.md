# CodIn Electron App

Standalone Electron application for CodIn - a multilingual AI-powered code editor.

## Architecture

This is the transformation of CodIn from a VS Code extension to a standalone Electron application, similar to Cursor.

### Directory Structure

```
electron-app/
├── src/
│   ├── main/           # Main process (Node.js)
│   │   ├── main.ts     # Application entry point
│   │   ├── WindowManager.ts
│   │   ├── ElectronIde.ts  # IDE abstraction (replaces VsCodeIde.ts)
│   │   ├── ipc/
│   │   │   └── IpcHandler.ts
│   │   └── services/
│   │       ├── FileSystemService.ts
│   │       ├── GitService.ts
│   │       ├── TerminalService.ts
│   │       ├── ModelManagerService.ts
│   │       └── AgentService.ts
│   └── preload/        # Preload scripts
│       └── preload.ts  # IPC bridge to renderer
├── dist/              # Compiled output
├── build/             # Build resources (icons, etc.)
├── release/           # Packaged applications
├── package.json
├── tsconfig.main.json
└── tsconfig.preload.json
```

### Key Components

#### Main Process

- **main.ts**: Entry point, initializes all services and creates application window
- **WindowManager**: Manages application windows, state persistence
- **ElectronIde**: Implements IDE interface using Node.js APIs (replaces VsCodeIde.ts)
- **IpcHandler**: Registers all IPC handlers for renderer communication

#### Services

- **FileSystemService**: File operations, workspace management, file watching
- **GitService**: Git operations using simple-git
- **TerminalService**: Terminal emulation using node-pty
- **ModelManagerService**: Local LLM model downloads and management
- **AgentService**: CodIn Agent integration (i18n, voice, AI features)

#### Preload Script

- **preload.ts**: Exposes safe IPC APIs to renderer via contextBridge

### Communication Flow

```
Renderer (GUI)
    ↓ window.codinAPI.*
Preload (contextBridge)
    ↓ ipcRenderer.invoke()
IPC Handler
    ↓ Service calls
Services (FileSystem, Git, Terminal, Models, Agent)
    ↓ Native APIs
Node.js / Electron / System
```

## Development

### Prerequisites

- Node.js 18+
- Python 3.8+ (for CodIn Agent)
- Git

### Setup

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

### Building for Production

```bash
# Build for current platform
npm run dist

# Build for specific platforms
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## Features

### Multilingual Support

- **Languages**: Hindi, Assamese, Tamil, English
- **Translation**: AI4Bharat IndicTrans2
- **Voice**: STT (AI4Bharat + Whisper), TTS (OS integration)
- **UI**: Full RTL support, Indic fonts

### Built-in AI/LLM

- **Local Inference**: llama.cpp integration
- **Default Models**:
  - Qwen2.5-Coder 1.5B (~900MB) - Fast code completion
  - DeepSeek-R1 7B (~4GB) - Advanced reasoning
- **Model Manager**: Download, manage, switch models
- **Offline-First**: Works without internet after initial setup

### IDE Features

- **Monaco Editor**: Full-featured code editor
- **File Explorer**: Complete file tree with operations
- **Integrated Terminal**: Multiple terminals with node-pty
- **Git Integration**: Status, diff, commit, branches
- **LSP Support**: Code intelligence (planned)

### CodIn Agent

The CodIn Agent service runs automatically and provides:

- Translation between Indian languages
- Voice input/output
- Local LLM inference
- Multilingual code understanding

## Configuration

User configuration is stored in:

- **Windows**: `%APPDATA%\codin-electron`
- **macOS**: `~/Library/Application Support/codin-electron`
- **Linux**: `~/.config/codin-electron`

Configuration files:

- `config.json` - User preferences
- `window-state.json` - Window position/size
- `workspace.json` - Last workspace path
- `models.json` - Model management

## Building from VS Code Extension

### Migration Status

✅ **Completed:**

- Electron foundation (main process, window manager)
- IPC communication system
- All core services
- ElectronIde abstraction
- Package configuration

🚧 **In Progress:**

- GUI adaptation (React app)
- Monaco editor integration
- File tree component

📅 **Planned:**

- LSP client implementation
- Extensions system
- Settings UI
- Command palette

### Reusable Components

- **core/** (100% reusable) - Business logic, protocol system
- **gui/** (95% reusable) - React UI, only IPC layer needs changes
- **packages/agent/** (100% reusable) - i18n, voice, AI service

### Replaced Components

- **VsCodeIde.ts** → **ElectronIde.ts** (708 lines reimplemented)
- VS Code extension APIs → Electron APIs
- Webview postMessage → IPC (ipcRenderer/ipcMain)

## Packaging

The packaged app includes:

- Electron runtime
- GUI (built React app)
- Core libraries
- llama.cpp binaries
- CodIn Agent (Python service)
- Default models (optional, can be downloaded)

### Bundle Size

- Base app: ~150MB
- With Qwen2.5-Coder 1.5B: ~1GB
- With both models: ~4.1GB

## License

Apache-2.0

## Development Timeline

Following a 12-week transformation plan:

- **Weeks 1-2**: Foundation + Multilingual core ✅ (CURRENT)
- **Weeks 3-5**: IDE features + Model Manager
- **Weeks 6-7**: LSP + Terminal + Multilingual intelligence
- **Week 8**: Commands/menus + AI features
- **Week 9**: State management + Offline guarantees
- **Week 10**: Packaging + Distribution
- **Weeks 11-12**: Testing + Polish
