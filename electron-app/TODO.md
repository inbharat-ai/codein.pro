# CodIn Electron - Next Steps & TODO

This file tracks what needs to be implemented next in the transformation from VS Code extension to standalone Electron app.

---

## ✅ COMPLETED (Weeks 1-2)

- [x] Project setup and configuration
- [x] Main process architecture
- [x] Window manager with state persistence
- [x] IPC communication system
- [x] FileSystemService
- [x] GitService
- [x] TerminalService
- [x] ModelManagerService
- [x] AgentService
- [x] ElectronIde abstraction
- [x] Preload script with contextBridge
- [x] TypeScript configuration
- [x] Documentation (README, Getting Started, Summary)

---

## 🚧 IN PROGRESS (Week 3)

### GUI Adaptation

**Priority: CRITICAL**
**Files to modify:**

- [ ] `gui/src/util/IdeMessenger.tsx` - Replace postMessage with window.codinAPI
- [ ] `gui/src/redux/slices/uiSlice.ts` - Add Electron-specific state
- [ ] `gui/vite.config.ts` - Update for Electron target

**Tasks:**

1. [ ] Create `gui/src/electron/ElectronIdeMessenger.ts`

   - Implement messenger using window.codinAPI instead of postMessage
   - Handle all protocol message types
   - Add type guards for window.codinAPI availability

2. [ ] Update GUI entry point

   - Detect if running in Electron vs VS Code extension
   - Load appropriate messenger (ElectronIdeMessenger vs VsCodeIdeMessenger)

3. [ ] Test message flow
   - Test ToIdeProtocol messages (IDE → Core)
   - Test FromWebviewProtocol messages (Core → IDE)
   - Verify all existing features work

**Estimated effort**: 2-3 days

---

## 📅 WEEK 3-4: Monaco & File Tree

### Monaco Editor Integration

**Priority: HIGH**
**New files needed:**

- [ ] `gui/src/components/monaco/MonacoEditor.tsx`
- [ ] `gui/src/components/monaco/MonacoConfig.ts`
- [ ] `gui/src/hooks/useMonacoEditor.ts`

**Tasks:**

1. [ ] Create Monaco wrapper component

   - Initialize Monaco editor
   - Handle file loading
   - Syntax highlighting
   - Theme integration (dark/light)
   - Diff viewer for changes

2. [ ] File tabs management

   - Open files tracking
   - Tab switching
   - Close file
   - Dirty state indicator
   - Save on Ctrl+S

3. [ ] Editor features
   - Find/replace
   - Go to line
   - Format document
   - Multi-cursor support
   - Minimap

**Estimated effort**: 4-5 days

### File Tree Component

**Priority: HIGH**
**New files needed:**

- [ ] `gui/src/components/FileExplorer/FileTree.tsx`
- [ ] `gui/src/components/FileExplorer/FileTreeNode.tsx`
- [ ] `gui/src/components/FileExplorer/ContextMenu.tsx`

**Tasks:**

1. [ ] Tree structure

   - Recursive tree rendering
   - Expand/collapse folders
   - Icons for file types
   - Loading states

2. [ ] File operations

   - Click to open file
   - Right-click context menu
   - Rename file/folder
   - Delete file/folder
   - Create new file/folder
   - Copy/paste

3. [ ] File watching
   - Auto-refresh on external changes
   - Highlight unsaved files

**Estimated effort**: 3-4 days

### Model Manager UI

**Priority: MEDIUM**
**New files needed:**

- [ ] `gui/src/components/ModelManager/ModelList.tsx`
- [ ] `gui/src/components/ModelManager/DownloadProgress.tsx`
- [ ] `gui/src/components/ModelManager/ModelCard.tsx`

**Tasks:**

1. [ ] Model list view

   - Display available models
   - Show download status
   - Active model indicator
   - Storage usage

2. [ ] Download UI

   - Progress bars
   - Speed/ETA display
   - Cancel download
   - Error handling

3. [ ] Model management
   - Set active model
   - Delete model
   - Model info modal
   - Settings integration

**Estimated effort**: 2-3 days

---

## 📅 WEEK 5: Integration & Testing

### Terminal UI

**Priority: HIGH**
**New files needed:**

- [ ] `gui/src/components/Terminal/TerminalPanel.tsx`
- [ ] `gui/src/components/Terminal/TerminalTab.tsx`
- [ ] `gui/src/hooks/useTerminal.ts`

**Tasks:**

1. [ ] xterm.js integration

   - Initialize xterm
   - Connect to TerminalService via IPC
   - Handle resize
   - Handle input/output

2. [ ] Terminal management
   - Multiple terminal tabs
   - Create new terminal
   - Close terminal
   - Clear terminal
   - Terminal title

**Estimated effort**: 2-3 days

### Testing & Polish

**Tasks:**

- [ ] Test all file operations
- [ ] Test all git operations
- [ ] Test terminal functionality
- [ ] Test model downloads
- [ ] Test agent integration
- [ ] Fix bugs and edge cases
- [ ] Performance optimization

**Estimated effort**: 3-4 days

---

## 📅 WEEK 6-7: LSP & Multilingual Features

### LSP Integration

**Priority: HIGH**
**New files needed:**

- [ ] `electron-app/src/main/services/LspService.ts`
- [ ] `electron-app/src/main/lsp/LspClient.ts`
- [ ] IPC handlers for LSP

**Tasks:**

1. [ ] LSP client implementation

   - Language server spawning
   - LSP protocol implementation
   - Multiple language servers
   - Capabilities negotiation

2. [ ] Monaco integration
   - Completions
   - Hover info
   - Diagnostics (errors/warnings)
   - Go to definition
   - Find references
   - Rename symbol

**Estimated effort**: 5-7 days

### Multilingual Code Intelligence

**Priority: MEDIUM**
**Files to enhance:**

- [ ] AgentService.ts - Add code understanding APIs
- [ ] GUI - Add language selector
- [ ] Monaco - Add multilingual tooltips

**Tasks:**

1. [ ] Code translation

   - Translate comments
   - Translate docstrings
   - Translate variable names (with context)

2. [ ] Voice coding panel

   - Push-to-talk UI (Ctrl+Shift+V)
   - STT feedback
   - Voice command parsing
   - Code insertion

3. [ ] Multilingual UI
   - Language switcher
   - Translate all UI strings
   - RTL support
   - Indic fonts preloading

**Estimated effort**: 4-5 days

---

## 📅 WEEK 8: Commands & Menus

### Command Palette

**Priority: HIGH**
**New files needed:**

- [ ] `gui/src/components/CommandPalette/CommandPalette.tsx`
- [ ] `gui/src/components/CommandPalette/CommandRegistry.ts`

**Tasks:**

1. [ ] Command palette UI

   - Fuzzy search
   - Keyboard navigation
   - Recent commands
   - Command categories

2. [ ] Command registry
   - Register all commands
   - Keybindings
   - Execute commands
   - Context-aware commands

**Estimated effort**: 3-4 days

### Menus & Shortcuts

**Tasks:**

- [ ] Application menu (File, Edit, View, etc.)
- [ ] Context menus (right-click)
- [ ] Keyboard shortcuts registry
- [ ] Shortcut customization

**Estimated effort**: 2-3 days

---

## 📅 WEEK 9: State & Offline

### State Persistence

**Tasks:**

- [ ] Save/restore open files
- [ ] Save/restore editor state (cursor, scroll)
- [ ] Save/restore layout (panel sizes)
- [ ] Save/restore terminal sessions
- [ ] Workspace-specific settings

**Estimated effort**: 3-4 days

### Offline-First Validation

**Tasks:**

- [ ] Test without internet
- [ ] Verify models work offline
- [ ] Verify agent runs offline
- [ ] Cache management
- [ ] Offline indicator

**Estimated effort**: 2 days

---

## 📅 WEEK 10: Packaging

### Build Configuration

**Tasks:**

- [ ] Design icons (256x256, 512x512, 1024x1024)
- [ ] Create .ico (Windows)
- [ ] Create .icns (macOS)
- [ ] Create .png (Linux)
- [ ] electron-builder configuration
- [ ] Bundle llama.cpp binaries
- [ ] Bundle Python runtime (PyInstaller)
- [ ] Bundle agent service

**Estimated effort**: 3-4 days

### Distribution

**Tasks:**

- [ ] Windows installer (NSIS)
- [ ] Windows portable
- [ ] macOS DMG
- [ ] macOS code signing
- [ ] Linux AppImage
- [ ] Linux .deb
- [ ] Linux .rpm
- [ ] Auto-updater setup

**Estimated effort**: 3-4 days

---

## 📅 WEEK 11-12: Testing & Polish

### Testing

**Tasks:**

- [ ] Unit tests for services
- [ ] Integration tests for IPC
- [ ] E2E tests with Spectron/Playwright
- [ ] Performance testing
- [ ] Memory leak detection
- [ ] Cross-platform testing (Win/Mac/Linux)

**Estimated effort**: 5-7 days

### Documentation

**Tasks:**

- [ ] User manual
- [ ] Feature showcase
- [ ] Video tutorials
- [ ] API documentation
- [ ] Contributing guide
- [ ] Release notes

**Estimated effort**: 3-4 days

### Polish

**Tasks:**

- [ ] Loading screens
- [ ] Splash screen
- [ ] Animations
- [ ] Accessibility
- [ ] Error messages
- [ ] Empty states
- [ ] Onboarding flow

**Estimated effort**: 3-4 days

---

## 🔧 Technical Debt

### Known Issues

1. **Import paths in ElectronIde.ts**

   - Currently: `import { IDE, IDEUtils } from '../../core/protocol';`
   - Need to verify path or use TypeScript path mapping

2. **Agent service STT/TTS**

   - APIs defined but not implemented
   - Need binary data upload/download for audio

3. **Model download resume**

   - Current implementation doesn't support resume
   - Need to implement chunked download with resume

4. **Terminal session persistence**

   - Terminals don't persist across app restarts
   - Need to save terminal state

5. **Performance optimization**
   - File watching may be expensive for large projects
   - Consider debouncing and batching

---

## 🎯 Success Criteria

### Week 3-4 (GUI Integration)

- [ ] Can open workspace folder
- [ ] Can view file tree
- [ ] Can open files in Monaco
- [ ] Can edit and save files
- [ ] Can see file changes
- [ ] Can download models
- [ ] Can select active model

### Week 5 (Integration)

- [ ] Terminal works
- [ ] Git status visible
- [ ] Can commit changes
- [ ] All services functional
- [ ] No critical bugs

### Week 6-7 (LSP & Multilingual)

- [ ] Code completion works
- [ ] Errors/warnings display
- [ ] Can translate UI to Hindi/Tamil/Assamese
- [ ] Voice input works (basic)
- [ ] All language features work

### Week 8-9 (Commands & State)

- [ ] Command palette functional
- [ ] Keyboard shortcuts work
- [ ] State persists across restarts
- [ ] Works completely offline

### Week 10-12 (Packaging & Release)

- [ ] Builds successfully on all platforms
- [ ] Installers work
- [ ] App is under 5GB with models
- [ ] Documentation complete
- [ ] Ready for user testing

---

## 📞 Questions to Resolve

1. Should we bundle Python runtime or require Python installation?
2. Should we include models in installer or download on first launch?
3. What's the minimum system requirements?
4. Should we support VS Code extensions compatibility?
5. What's the update strategy (auto-update vs manual)?

---

## 💡 Future Enhancements (Post-Launch)

- [ ] Extensions marketplace
- [ ] Remote development (SSH)
- [ ] Collaboration features
- [ ] Cloud sync
- [ ] Mobile companion app
- [ ] Browser version (WASM)
- [ ] More language models
- [ ] AI code review
- [ ] Voice-first coding mode
- [ ] Accessibility improvements

---

**Last Updated**: February 27, 2026  
**Current Phase**: Week 3 - GUI Integration  
**Next Milestone**: Monaco Editor working with file tree
