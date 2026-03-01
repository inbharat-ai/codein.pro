# 🚀 CodIn ELITE - Quick Reference Cheat Sheet

## Commands to Remember

```powershell
# Verify everything works
.\build.ps1 verify

# Build everything
.\build.ps1 build-all

# Start development
.\build.ps1 dev

# Build installer
.\build.ps1 package

# Clean everything
.\build.ps1 clean

# Show status
.\build.ps1 status
```

---

## File Locations (Copy-Paste Ready)

```
Backend Service APIs:
  C:\Users\reetu\Desktop\Bharta Code\electron-app\src\main\services\

Redux State:
  C:\Users\reetu\Desktop\Bharta Code\gui\src\redux\slices\

Components to Build:
  C:\Users\reetu\Desktop\Bharta Code\gui\src\components\panels\
  C:\Users\reetu\Desktop\Bharta Code\gui\src\components\modals\
  C:\Users\reetu\Desktop\Bharta Code\gui\src\components\ai\

Styling:
  C:\Users\reetu\Desktop\Bharta Code\gui\src\styles\

Translations:
  C:\Users\reetu\Desktop\Bharta Code\gui\src\i18n\
```

---

## React Component Template (Copy-Paste)

```typescript
// gui/src/components/panels/NewPanel.tsx

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../redux/store';

interface Props {
  // Add props here
}

export const NewPanel: React.FC<Props> = () => {
  const dispatch = useDispatch();
  // Use selector to get state
  const state = useSelector((state: RootState) => state.ui);

  const handleAction = async () => {
    // Call IPC
    const result = await window.codinAPI.service.method();

    // Update Redux
    dispatch(someAction(result));
  };

  return (
    <div className="panel">
      <div className="panel-header">Panel Title</div>
      <div className="panel-content">
        {/* Content here */}
      </div>
    </div>
  );
};
```

---

## Redux Integration Pattern

```typescript
// In component
import { useDispatch, useSelector } from "react-redux";
import { setActivePanel } from "../../redux/slices/uiSlice";

const dispatch = useDispatch();
const activePanel = useSelector((state) => state.ui.activePanel);

// Dispatch action
dispatch(setActivePanel("git"));
```

---

## IPC Call Pattern

```typescript
// In component
const handleGitStatus = async () => {
  try {
    const status = await window.codinAPI.git.getStatus();
    dispatch(setChanges(status.changes));
  } catch (error) {
    console.error("Git status failed:", error);
  }
};
```

---

## CSS Class Naming

```css
/* Block-element-modifier (BEM) */
.panel {
  /* Block */
}
.panel__header {
  /* Element */
}
.panel__content {
  /* Element */
}
.panel--active {
  /* Modifier */
}
```

---

## Redux Slice Template

```typescript
// gui/src/redux/slices/newSlice.ts

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface NewState {
  property: string;
}

const initialState: NewState = {
  property: "",
};

const newSlice = createSlice({
  name: "new",
  initialState,
  reducers: {
    setProperty: (state, action: PayloadAction<string>) => {
      state.property = action.payload;
    },
  },
});

export const { setProperty } = newSlice.actions;
export default newSlice.reducer;
```

---

## Available Services (window.codinAPI)

```typescript
// File System
window.codinAPI.fs.readFile(path);
window.codinAPI.fs.writeFile(path, content);
window.codinAPI.fs.listFiles(directory);
window.codinAPI.fs.deleteFile(path);
window.codinAPI.fs.createDirectory(path);

// Git
window.codinAPI.git.getStatus();
window.codinAPI.git.getLog();
window.codinAPI.git.commit(message);
window.codinAPI.git.push();
window.codinAPI.git.pull();
window.codinAPI.git.getDiff(filePath);
window.codinAPI.git.getBranches();
window.codinAPI.git.switchBranch(branchName);
window.codinAPI.git.createBranch(branchName);

// Terminal
window.codinAPI.terminal.execute(command);
window.codinAPI.terminal.createTab();
window.codinAPI.terminal.closeTab(tabId);

// AI/Agent
window.codinAPI.agent.generateCompletion(prompt, options);
window.codinAPI.agent.streamCompletion(prompt, options, callback);
window.codinAPI.agent.explainCode(code);
window.codinAPI.agent.generateTests(code, framework);
window.codinAPI.agent.generateDocs(code, format);
window.codinAPI.agent.speechToText(audio, language);
window.codinAPI.agent.textToSpeech(text, language);

// Models
window.codinAPI.models.listModels();
window.codinAPI.models.downloadModel(modelId);
window.codinAPI.models.setActiveModel(modelId);
window.codinAPI.models.getModelInfo(modelId);
```

---

## Component Priority (Build in This Order)

```
CRITICAL (People need these first):
1. GitPanel          (1h)
2. SearchPanel       (1h)
3. CommandPalette    (1h)

IMPORTANT (Next priorities):
4. DebugPanel        (1.5h)
5. StatusBar         (0.5h)
6. Styling           (2h)

NICE-TO-HAVE (Polish later):
7. Extensions        (1h)
8. Settings          (1.5h)
9. VoicePanel        (1.5h)
10. Multilingual     (4h)
```

---

## Git Workflow for Repository

```bash
# Initial setup
git init
git add .
git commit -m "Initial CodIn ELITE - complete IDE"

# Daily work
git add .
git commit -m "Add GitPanel component"

# Push to GitHub
git remote add origin https://github.com/yourname/CodIn
git push -u origin main
```

---

## Language Detection Implementation

```typescript
const languageMap: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  java: "java",
  cpp: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sh: "shell",
  bash: "shell",
  sql: "sql",
  html: "html",
  css: "css",
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  tex: "latex",
  r: "r",
  pl: "perl",
  lua: "lua",
  vim: "vim",
  docker: "dockerfile",
  gradle: "java",
  maven: "java",
};

const detectLanguage = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return languageMap[ext] || "plaintext";
};
```

---

## Common Redux Patterns

```typescript
// Get state
const activeFile = useSelector((state) => state.editor.activeFile);

// Get multiple values
const { activeFile, openFiles } = useSelector((state) => ({
  activeFile: state.editor.activeFile,
  openFiles: state.editor.openFiles,
}));

// Dispatch action
dispatch(setActiveFile(filePath));

// Async action with try-catch
const handleLoad = async () => {
  try {
    const content = await window.codinAPI.fs.readFile(path);
    dispatch(setEditorValue(content));
  } catch (error) {
    console.error("Failed to load file:", error);
  }
};
```

---

## CSS Variables Reference

```css
/* Colors */
var(--bg-primary)        /* Main background: #1e1e1e */
var(--bg-secondary)      /* Secondary: #252526 */
var(--bg-tertiary)       /* Tertiary: #2d2d30 */
var(--fg-primary)        /* Main text: #d4d4d4 */
var(--fg-secondary)      /* Secondary text: #858585 */
var(--accent-primary)    /* Accent: #007acc */
var(--accent-hover)      /* Hover: #1177bb */
var(--error)             /* Error: #f14c4c */
var(--warning)           /* Warning: #ce9178 */
var(--success)           /* Success: #6a9955 */

/* Spacing */
var(--spacing-xs)        /* 4px */
var(--spacing-sm)        /* 8px */
var(--spacing-md)        /* 16px */
var(--spacing-lg)        /* 24px */
var(--spacing-xl)        /* 32px */

/* Sizes */
var(--activity-bar-width)    /* 50px */
var(--sidebar-width)         /* 300px */
var(--bottom-panel-height)   /* 300px */
var(--tab-height)            /* 35px */
var(--statusbar-height)      /* 25px */
```

---

## Redux Slices Summary

```typescript
// ui - UI state (panels, modals, theme, language)
state.ui.activePanel; // 'explorer' | 'search' | 'git' | ...
state.ui.sidebarWidth; // number
state.ui.theme; // 'light' | 'dark'
state.ui.language; // 'en' | 'hi' | 'ta' | 'as'

// editor - Editor state (files, content, selection)
state.editor.activeFile; // string (path)
state.editor.openFiles; // EditorFile[]
state.editor.content; // string

// copilot - AI state (messages, model, settings)
state.copilot.messages; // ChatMessage[]
state.copilot.selectedModel; // string
state.copilot.isGenerating; // boolean

// git - Git state (changes, branches, commits)
state.git.changes; // GitFile[]
state.git.currentBranch; // string
state.git.stagedFiles; // string[]

// workspace - Workspace (path, recent files)
state.workspace.path; // string
state.workspace.recentFiles; // string[]

// settings - User settings
state.settings.fontSize; // number
state.settings.autosave; // boolean
state.settings.gitAuthor; // string

// commands - Command registry
state.commands.commands; // Command[]
state.commands.recentCommands; // string[]
```

---

## Pre-built Commands (20 Available)

```typescript
copilot.completion;
copilot.chat;
copilot.explain;
copilot.generateTests;
copilot.debugIssue;
copilot.generateDocs;
copilot.refactor;
copilot.voice;

editor.formatDocument;
editor.organizeImports;
editor.quickFix;

git.commit;
git.push;
git.pull;

debug.start;
debug.continue;

tests.runAll;

build.buildAndRun;

file.save;
file.saveAll;
file.newFile;
file.closeAll;
```

**Trigger with**: Ctrl+Shift+P (will search these)

---

## File Size Reference

```
electron-app/dist/       ~100 MB (compiled)
gui/dist/                ~5 MB  (bundled)
node_modules combined    ~800 MB (npm packages)
Models (optional)        ~3000 MB (5 models total)
Total installer          ~40-100 MB (compressed)
```

---

## Build Times

```
npm install (full)       ~3-5 minutes (first time only)
npm install (cached)     ~30 seconds
npm run build (TS)       ~10-20 seconds
npm run build (React)    ~30-60 seconds
Build and package        ~2-3 minutes
```

---

## Performance Debug

```typescript
// Measure action performance
console.time("action-name");
// ... do something
console.timeEnd("action-name");

// React render count
console.count("Component render");

// Memory usage
console.log(performance.memory);
```

---

## Keyboard Shortcuts (Pre-configured)

```
Ctrl+Shift+P          Command Palette
Ctrl+K Ctrl+E         Open Explorer
Ctrl+K Ctrl+S         Open Search
Ctrl+K Ctrl+G         Open Git
Ctrl+K Ctrl+X         Open Debug
Ctrl+K Ctrl+D         Open Extensions
Ctrl+``               Toggle Terminal
Ctrl+B                Toggle Sidebar
Ctrl+J                Toggle Bottom Panel
Ctrl+1/2/3            Switch tabs
Ctrl+W                Close tab
Ctrl+S                Save
Ctrl+Shift+S          Save All
Ctrl+Shift+V          Voice input
```

---

## External Services NOT Needed ✅

```
❌ GitHub API
❌ Translation API
❌ LLM APIs
❌ CDN
❌ Cloud storage
❌ Analytics
❌ Telemetry

✅ Everything is local and offline!
```

---

## Component Building Checklist

For each new component:

- [ ] Create tsx file
- [ ] Define Props interface
- [ ] Add useSelector for redux state
- [ ] Add useDispatch for actions
- [ ] Add error handling
- [ ] Add loading state
- [ ] Add default export
- [ ] Add to main layout
- [ ] Add styling
- [ ] Test IPC calls
- [ ] Add to redux store (if needed)

---

## Testing During Development

```typescript
// Simple test
const mockState = { /* ... */ };
const component = render(<MyComponent />);
expect(component).toHaveTextContent('Expected');

// Async test
it('loads data', async () => {
  render(<MyComponent />);
  await waitFor(() => {
    expect(screen.getByText('Data loaded')).toBeInTheDocument();
  });
});
```

---

## Common Errors & Fixes

| Error                     | Fix                                 |
| ------------------------- | ----------------------------------- |
| "Cannot find module"      | Run `npm install`                   |
| "Port 9090 in use"        | Change port or kill process         |
| "IPC not found"           | Check preload.ts loaded correctly   |
| "Redux state undefined"   | Add selector with proper state path |
| "CSS not loading"         | Check import path and file exists   |
| "Component not rendering" | Check Redux connection and props    |

---

## Deployment Checklist

- [ ] All components built and styled
- [ ] AI integration functional
- [ ] Multilingual working
- [ ] No console errors
- [ ] Startup < 2 seconds
- [ ] All IPC calls working
- [ ] Tests passing
- [ ] Build succeeds
- [ ] Installer creates
- [ ] Installer runs cleanly
- [ ] All features testable

---

## Quick Start (Copy-Paste)

```powershell
cd "C:\Users\reetu\Desktop\Bharta Code"
.\build.ps1 verify
.\build.ps1 build-all
.\build.ps1 dev
# Open http://localhost:9090
```

---

## Documentation Files Reference

| File                                  | Purpose                | Read Time |
| ------------------------------------- | ---------------------- | --------- |
| README_START_HERE.md                  | Overview & quick start | 10 min    |
| COMPONENT_IMPLEMENTATION_CHECKLIST.md | Component breakdown    | 15 min    |
| CODIN_ELITE_SPEC.md                   | Feature specification  | 20 min    |
| CODIN_ELITE_QUICK_START.md            | Developer guide        | 15 min    |
| IMPLEMENTATION_ROADMAP_COMPLETE.md    | Build guide            | 10 min    |
| QUICK_REFERENCE_CHEATSHEET.md         | This file              | 5 min     |

---

**Bookmark this file! It has everything you need to remember while coding.**

**Let's build! 🚀**
