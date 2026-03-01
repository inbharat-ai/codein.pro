# Getting Started with CodIn Electron Development

This guide will help you start working on the CodIn standalone Electron application.

## Quick Start

### 1. Install Dependencies

```bash
cd electron-app
npm install
```

### 2. Build the Application

```bash
npm run build
```

This compiles both the main process and preload scripts from TypeScript to JavaScript.

### 3. Run in Development Mode

```bash
npm run dev
```

This will:

- Build the main process
- Launch Electron with the CodIn application
- Open DevTools automatically (in development mode)

## Development Workflow

### Watch Mode for Faster Development

Open two terminal windows:

**Terminal 1 - Watch main process:**

```bash
npm run watch:main
```

**Terminal 2 - Watch preload:**

```bash
npm run watch:preload
```

**Terminal 3 - Run Electron:**

```bash
npm start
```

Now your TypeScript files will automatically recompile on save. Just reload the Electron window (Ctrl+R / Cmd+R) to see changes.

### Debugging

The application opens with DevTools in development mode. You can:

- Use `console.log()` in main process → Shows in terminal
- Use `console.log()` in renderer → Shows in DevTools Console
- Set breakpoints in DevTools for renderer code
- Use VS Code debugger for main process (attach to Node.js)

### Testing the Services

Each service can be tested independently:

#### FileSystemService

```typescript
const fs = new FileSystemService();
await fs.setWorkspacePath("/path/to/workspace");
const files = await fs.readDir("src");
```

#### GitService

```typescript
const git = new GitService(fileSystemService);
const status = await git.status();
const branches = await git.branch();
```

#### TerminalService

```typescript
const terminal = new TerminalService();
const id = await terminal.create();
terminal.onData(id, (data) => console.log(data));
await terminal.write(id, "ls\n");
```

#### ModelManagerService

```typescript
const models = new ModelManagerService();
await models.initialize();
const modelList = await models.listModels();
```

#### AgentService

```typescript
const agent = new AgentService();
await agent.start();
const languages = await agent.getSupportedLanguages();
```

## Project Structure Explained

### Main Process (`src/main/`)

This runs in Node.js and has access to all native APIs:

- **main.ts**: Application lifecycle, service initialization
- **WindowManager.ts**: Window creation, state management
- **ElectronIde.ts**: IDE abstraction for core protocol system
- **ipc/IpcHandler.ts**: Handles all communication from renderer
- **services/**: Individual service implementations

### Preload Script (`src/preload/`)

This runs in a sandboxed context and exposes safe APIs:

- **preload.ts**: Uses `contextBridge` to expose `window.codinAPI`

The preload script is the security boundary. Never expose raw IPC or Node.js to the renderer!

### Renderer (GUI - separate from this package)

The GUI is in `gui/` and will be served:

- In dev: From Vite dev server (http://localhost:5173)
- In prod: From built files (`gui/dist/index.html`)

## Current Implementation Status

### ✅ Completed

- [x] Electron foundation
- [x] Window management with state persistence
- [x] IPC communication system
- [x] FileSystemService (read, write, watch)
- [x] GitService (status, diff, commit, branch)
- [x] TerminalService (create, write, resize, kill)
- [x] ModelManagerService (list, download, delete, manage)
- [x] AgentService (i18n, voice, AI integration)
- [x] ElectronIde (IDE abstraction)
- [x] TypeScript configuration

### 🚧 Next Steps

1. **GUI Integration** (Week 3)

   - Update `gui/` to use `window.codinAPI` instead of webview postMessage
   - Integrate Monaco editor
   - Build file tree component

2. **Model Manager UI** (Week 3-4)

   - Create download progress UI
   - Model selection interface
   - Settings panel

3. **LSP Integration** (Week 6)

   - Language server client
   - Code intelligence features

4. **Testing** (Week 11-12)
   - Unit tests for services
   - Integration tests
   - E2E tests with Spectron

## Important Notes

### TypeScript Paths

The ElectronIde.ts imports from `../../core/protocol`. This assumes the core package is at:

```
CodIn/
├── core/
├── electron-app/
└── gui/
```

You may need to adjust import paths or use TypeScript path mapping.

### Python Dependency

The AgentService requires Python 3.8+ and the CodIn Agent to be installed:

```bash
cd packages/agent
pip install -r requirements.txt
python src/server.py --port 43120
```

In production, this will be bundled with the app.

### Platform-Specific Code

Some features are platform-specific:

- **node-pty**: Terminal emulation (works on all platforms)
- **fix-path**: macOS/Linux PATH fixing
- **Shell selection**: Different defaults per platform

Test on all target platforms before releasing!

## Building for Production

### Development Build

Quick build without optimization:

```bash
npm run pack
```

Output: `release/`

### Production Build

Optimized build for distribution:

```bash
npm run dist
```

This creates:

- **Windows**: .exe installer + portable
- **macOS**: .dmg + .zip
- **Linux**: .AppImage + .deb + .rpm

### Platform-Specific Builds

```bash
npm run dist:win    # Windows only
npm run dist:mac    # macOS only
npm run dist:linux  # Linux only
```

### Build Configuration

Edit `package.json` → `build` section for:

- App ID
- Icons
- Extra resources (models, agent)
- Installer options
- Code signing (for production)

## Troubleshooting

### "Cannot find module 'electron'"

```bash
npm install
```

### "Port 43120 already in use"

The CodIn Agent is already running. Kill it:

```bash
# Windows
taskkill /F /IM python.exe

# macOS/Linux
pkill -f "python.*server.py"
```

### "node-pty build failed"

node-pty requires native compilation. Install build tools:

**Windows:**

```bash
npm install --global windows-build-tools
```

**macOS:**

```bash
xcode-select --install
```

**Linux:**

```bash
sudo apt-get install build-essential python3
```

### GUI not loading

1. Check if Vite dev server is running (in dev)
2. Check if `gui/dist/` exists (in prod)
3. Check browser console in DevTools

## Contributing

When adding new features:

1. Create service in `src/main/services/`
2. Add IPC handlers in `src/main/ipc/IpcHandler.ts`
3. Expose API in `src/preload/preload.ts`
4. Use from GUI via `window.codinAPI.*`

Always maintain the security boundary - never expose unsafe APIs to renderer!

## Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [IPC Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [node-pty](https://github.com/microsoft/node-pty)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)

## Questions?

Check the main README.md or the conversation summary for architectural decisions and project context.
