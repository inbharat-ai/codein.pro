# CodIn Development Guide

## Setup

### Prerequisites

- Node.js 20+
- VS Code 1.70+
- Git

### Clone and Install

```bash
git clone <your-fork>
cd Bharta\ Code
npm install
cd gui
npm install
cd ..
```

### Build Extension

```bash
cd packages/extension
npm install
npm run esbuild
```

### Launch Debug Session

1. Open workspace in VS Code
2. Press F5 (or Run > Start Debugging)
3. A new Extension Development Host window opens
4. Open Command Palette (Ctrl+Shift+P)
5. Type "CodIn" to see commands

## Project Structure

```
Bharta Code/
├── packages/
│   ├── extension/          # VS Code extension (main package)
│   │   ├── src/
│   │   │   ├── activation/  # Extension activation & setup
│   │   │   ├── agent/       # CodIn Agent manager
│   │   │   ├── contract/    # Edit contract applier
│   │   │   ├── extension/   # VsCodeExtension + VsCodeMessenger
│   │   │   └── ...
│   │   └── package.json
│   ├── agent/              # CodIn Agent local service
│   │   ├── src/
│   │   │   ├── index.js     # HTTP server
│   │   │   ├── store.js     # Model store
│   │   │   └── router.js    # Router heuristics
│   │   └── test/
│   └── shared/             # Shared schemas & utilities
│       ├── src/
│       │   ├── index.ts     # Contract types & validation
│       │   └── diff.mts     # Unified diff applier
│       └── test/
├── gui/                    # React webview UI
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   ├── ModeSelector.tsx
│   │   │   ├── ImplementPreviewPanel.tsx
│   │   │   ├── ModelManagerPanel.tsx
│   │   │   └── VoicePanel.tsx
│   │   ├── pages/
│   │   │   ├── config/     # Settings UI
│   │   │   │   ├── sections/
│   │   │   │   │   ├── RunSection.tsx
│   │   │   │   │   ├── GitSection.tsx
│   │   │   │   │   ├── DeploySection.tsx
│   │   │   │   │   └── McpSection.tsx
│   │   │   └── gui/
│   │   │       └── Chat.tsx # Main chat interface
│   │   └── redux/
│   │       └── thunks/
│   │           ├── streamNormalInput.ts  # Mode & tool handling
│   │           └── streamResponse.ts     # Response streaming
│   └── package.json
├── core/                   # Core LLM & IDE logic (inherited from CodIn)
│   ├── protocol/           # Webview <-> Extension <-> Core messaging
│   └── ...
└── .github/
    └── workflows/
        └── codin-tests.yml  # CI pipeline
```

## Development Workflow

### 1. Extension Development

- Edit files in `packages/extension/src/`
- Run `npm run esbuild` to rebuild
- Reload Extension Development Host (Ctrl+R in debug window)

### 2. GUI Development

- Edit files in `gui/src/`
- Run `npm run dev` in `gui/` folder for hot reload
- Or rebuild with `npm run build`
- Reload Extension Development Host

### 3. CodIn Agent Development

- Edit files in `packages/agent/src/`
- CodIn Agent restarts on extension reload
- Check logs: Output > CodIn Agent

### 4. Protocol Changes

- Edit `core/protocol/ideWebview.ts` for new messages
- Update handler in `packages/extension/src/extension/VsCodeMessenger.ts`
- Update caller in `gui/src/context/IdeMessenger.tsx`

## Testing

Run unit tests:

```bash
npm test
```

Run specific test file:

```bash
node --test packages/shared/test/contract.test.mjs
```

## Code Formatting

Format all files:

```bash
npm run format
```

Check formatting:

```bash
npm run format:check
```

## Debugging

### Extension Debugging

- Set breakpoints in `packages/extension/src/`
- Press F5 to launch debug session
- Breakpoints hit in main VS Code window

### Webview Debugging

- In Extension Development Host: Help > Toggle Developer Tools
- Console shows GUI logs
- Sources tab shows webpack bundles

### CodIn Agent Debugging

- Check Output > CodIn Agent for logs
- Test endpoints manually: `curl http://localhost:43120/health`

## Common Tasks

### Add a New Protocol Message

1. Define in `core/protocol/ideWebview.ts`:

```typescript
"myFeature/action": [{ param: string }, { result: string }];
```

2. Handle in `packages/extension/src/extension/VsCodeMessenger.ts`:

```typescript
this.onWebview("myFeature/action", async ({ data }) => {
  return { result: "done" };
});
```

3. Call from GUI:

```typescript
const response = await ideMessenger.request("myFeature/action", {
  param: "value",
});
```

### Add a New Config Section

1. Create section component: `gui/src/pages/config/sections/MySection.tsx`
2. Import in `gui/src/pages/config/configTabs.tsx`
3. Add to `topTabSections` or `bottomTabSections`

### Add a New Mode

1. Update mode type in core
2. Add mode handling in `gui/src/redux/thunks/streamNormalInput.ts`
3. Update mode selector in `gui/src/components/ModeSelector.tsx`

## Release Process

1. Update version in `packages/extension/package.json`
2. Update CHANGELOG.md
3. Commit changes
4. Build extension: `cd packages/extension && npm run package`
5. Test .vsix manually
6. Push to GitHub
7. Create GitHub release with .vsix attached

## Troubleshooting

**Extension won't activate:**

- Check Output > CodIn for errors
- Verify package.json activationEvents

**CodIn Agent not starting:**

- Check port 43120 is available
- Check Output > CodIn Agent

**GUI not loading:**

- Rebuild: `cd gui && npm run build`
- Check browser console in Developer Tools

**Tests failing:**

- Ensure Node 20+
- Run `npm install` in root
- Check test file paths

## Contributing

See CONTRIBUTING.md for guidelines.
