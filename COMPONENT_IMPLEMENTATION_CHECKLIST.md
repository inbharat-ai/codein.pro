# CodIn ELITE - Complete Implementation Checklist

## 📋 What to Build Next (In Priority Order)

This checklist shows exactly what components you need to build to complete CodIn ELITE. Each item includes the file path, component structure, and estimated time.

---

## PHASE 2B: COMPONENT IMPLEMENTATION (40-50 Hours)

### ✅ ALREADY DONE (5 Components)

- [x] ActivityBar.tsx
- [x] EditorArea.tsx
- [x] FileTree.tsx
- [x] CopilotChat.tsx
- [x] Terminal.tsx

### 🚧 TO BUILD TODAY (10 Hours)

#### 1. **GitPanel Component** (1 hour)

**File**: `gui/src/components/panels/GitPanel.tsx`

```typescript
// What it shows:
- File list with status (M/A/D/U/?)
- Staged/unstaged sections
- Commit message input
- Commit button
- Branch switcher dropdown
- Pull/push buttons
- Diff viewer on file hover

// Redux integration:
- dispatch(stageFile(filePath))
- dispatch(unstageFile(filePath))
- useSelector(state => state.git.changes)
- useSelector(state => state.git.currentBranch)

// IPC integration:
- window.codinAPI.git.getStatus()
- window.codinAPI.git.commit(message)
- window.codinAPI.git.push()
- window.codinAPI.git.pull()
```

#### 2. **SearchPanel Component** (1 hour)

**File**: `gui/src/components/panels/SearchPanel.tsx`

```typescript
// What it shows:
- Global search text input
- Replace input (optional)
- Search results list
- File tree of results
- Context preview on hover
- Replace all button
- Filter by file type

// Redux integration:
- dispatch(setSearchQuery(query))
- dispatch(setSearchResults(results))
- useSelector(state => state.ui.searchResults)

// IPC integration:
- window.codinAPI.fs.searchFiles(query, directory)
- window.codinAPI.fs.replaceInFiles(query, replacement)
```

#### 3. **DebugPanel Component** (1.5 hours)

**File**: `gui/src/components/panels/DebugPanel.tsx`

```typescript
// What it shows:
- Variables list (local/global/watch)
- Call stack
- Breakpoints list
- Debug console
- Step over/into/out buttons
- Continue button
- Stop button

// Redux integration:
- dispatch(setDebugState(state))
- dispatch(setVariables(vars))
- dispatch(setCallStack(stack))

// IPC integration:
- window.codinAPI.debug.start()
- window.codinAPI.debug.stepOver()
- window.codinAPI.debug.stepInto()
- window.codinAPI.debug.continue()
```

#### 4. **ProblemsPanel Component** (0.5 hours)

**File**: `gui/src/components/panels/ProblemsPanel.tsx`

```typescript
// What it shows:
- Errors list (grouped by file)
- Warnings list
- Info messages
- Filter by type
- Click to navigate to file:line
- Quick fix suggestions

// Redux integration:
- useSelector(state => state.ui.problems)
- dispatch(setProblem(problem))

// IPC integration:
- window.codinAPI.lint.getDiagnostics()
- window.codinAPI.lint.getQuickFix(line, col)
```

#### 5. **OutputPanel Component** (0.5 hours)

**File**: `gui/src/components/panels/OutputPanel.tsx`

```typescript
// What it shows:
- Output text scrolling window
- Channel selector (Build/Test/Run/Debug)
- Clear button
- Auto-scroll toggle
- Filter input

// Redux integration:
- useSelector(state => state.ui.outputChannel)
- dispatch(setOutputChannel(channel))

// IPC integration:
- window.codinAPI.terminal.getOutput(channel)
```

#### 6. **ExtensionsPanel Component** (1 hour)

**File**: `gui/src/components/panels/ExtensionsPanel.tsx`

```typescript
// What it shows:
- Installed extensions list
- Available extensions list (from marketplace)
- Search bar
- Install button
- Uninstall button
- Extension details on click
- Rating/download count

// Redux integration:
- useSelector(state => state.ui.installedExtensions)
- dispatch(installExtension(extensionId))
- dispatch(uninstallExtension(extensionId))

// IPC integration:
- window.codinAPI.extensions.list()
- window.codinAPI.extensions.install(id)
- window.codinAPI.extensions.uninstall(id)
```

#### 7. **SettingsPanel Component** (1.5 hours)

**File**: `gui/src/components/panels/SettingsPanel.tsx`

```typescript
// What it shows:
- Settings search box
- Settings organized by category:
  - Editor (font, size, tab width, etc)
  - Files (autosave, encoding)
  - Format (prettier options)
  - Keybindings (customizable)
  - Git (user, email)
- Toggle switches
- Input fields
- Dropdown selectors
- Reset to defaults button

// Redux integration:
- dispatch(updateSetting(key, value))
- useSelector(state => state.settings)

// IPC integration:
- window.codinAPI.settings.getSetting(key)
- window.codinAPI.settings.setSetting(key, value)
```

#### 8. **StatusBar Component** (0.5 hours)

**File**: `gui/src/components/StatusBar.tsx`

```typescript
// What it shows:
- Cursor position (Line, Column)
- File language indicator
- File encoding (UTF-8, etc)
- EOL indicator (LF, CRLF)
- Indentation (Spaces/Tabs, size)
- Zoom level
- Spaces used indicator

// Redux integration:
- useSelector(state => state.editor.cursorPosition)
- useSelector(state => state.editor.activeFile)

// IPC integration:
- No IPC needed, all local state
```

#### 9. **Breadcrumb Component** (0.5 hours)

**File**: `gui/src/components/Breadcrumb.tsx`

```typescript
// What it shows:
- Current file path as breadcrumb
- Home button
- Each part clickable to navigate
- Quick search dropdown on hover
- Recent files menu

// Redux integration:
- useSelector(state => state.editor.activeFile)
- dispatch(setActiveFile(filePath))

// IPC integration:
- window.codinAPI.fs.listFiles(directoryPath)
```

#### 10. **TabBar Component** (1 hour)

**File**: `gui/src/components/TabBar.tsx`

```typescript
// What it shows:
- Open file tabs
- Active tab highlighted
- Dirty indicator (dot) on unsaved files
- Close button on each tab
- Tab context menu (close, save, etc)
- Tab scrolling if too many

// Redux integration:
- useSelector(state => state.editor.openFiles)
- dispatch(setActiveFile(fileId))
- dispatch(closeFile(fileId))

// IPC integration:
- window.codinAPI.editor.saveFile(filePath)
```

### 🚧 MODAL/DIALOG COMPONENTS (6 Hours)

#### 1. **CommandPalette Modal** (1 hour)

**File**: `gui/src/components/modals/CommandPalette.tsx`

```typescript
// What it shows:
- Fuzzy searchable command list
- Recent commands at top
- Keybinding display
- Category grouping
- Preview command effect
- Enter to execute

// Redux integration:
- useSelector(state => state.commands.commands)
- dispatch(executeCommand(commandId))

// Keybinding:
- Ctrl+Shift+P / Cmd+Shift+P
```

#### 2. **QuickOpen/GoToFile Modal** (0.5 hours)

**File**: `gui/src/components/modals/QuickOpen.tsx`

#### 3. **GoToLine Modal** (0.5 hours)

**File**: `gui/src/components/modals/GoToLine.tsx`

#### 4. **SearchBox Modal** (1 hour)

**File**: `gui/src/components/modals/SearchBox.tsx`

#### 5. **InputDialog** (0.5 hours)

**File**: `gui/src/components/modals/InputDialog.tsx`

#### 6. **ConfirmDialog** (0.5 hours)

**File**: `gui/src/components/modals/ConfirmDialog.tsx`

#### 7. **SettingsDialog** (1 hour)

**File**: `gui/src/components/modals/SettingsDialog.tsx`

#### 8. **ThemeSelector** (0.5 hours)

**File**: `gui/src/components/modals/ThemeSelector.tsx`

### 🤖 AI COMPONENTS (8 Hours)

#### 1. **InlineCompletion** (1 hour)

**File**: `gui/src/components/ai/InlineCompletion.tsx`

```typescript
// What it shows:
- Ghost text inline with editor
- Appears after 500ms typing
- Tab to accept
- Escape to dismiss
- Alt+] to cycle suggestions

// Redux integration:
- dispatch(setInlineCompletion(suggestion))
- useSelector(state => state.copilot.inlineSuggestion)

// IPC integration:
- window.codinAPI.agent.generateCompletion(prefix, suffix, options)

// Streaming:
- Listen for chunks: window.codinAPI.agent.onCompletionChunk()
```

#### 2. **CompletionMenu** (1 hour)

**File**: `gui/src/components/ai/CompletionMenu.tsx`

```typescript
// What it shows:
- Popup menu with multiple suggestions
- Highlighted current selection
- Preview panel showing diff
- Details (confidence, etc)
- Number keys to select
- Enter to insert

// Redux integration:
- dispatch(setCompletions(suggestions))
- useSelector(state => state.copilot.completions)
```

#### 3. **VoicePanel** (1.5 hours)

**File**: `gui/src/components/ai/VoicePanel.tsx`

```typescript
// What it shows:
- Mic button (big, obvious)
- Recording indicator (waveform)
- Transcript display (live)
- Recognized language display
- Stop button
- Volume meter

// Redux integration:
- dispatch(setRecording(true/false))
- dispatch(setTranscript(text))
- useSelector(state => state.copilot.recording)

// IPC integration:
- window.codinAPI.agent.startSpeechToText(language)
- window.codinAPI.agent.onTranscript(callback)
- window.codinAPI.agent.stopSpeechToText()

// Keybinding:
- Ctrl+Shift+V to toggle recording
```

#### 4. **CodeExplainer** (1 hour)

**File**: `gui/src/components/ai/CodeExplainer.tsx`

```typescript
// What it shows:
- Selected code at top
- "Explain" button
- AI response in chat format
- Copy button
- Send to chat button

// Redux integration:
- useSelector(state => state.editor.selectedCode)
- dispatch(addMessage(message))

// IPC integration:
- window.codinAPI.agent.explainCode(code)
```

#### 5. **TestGenerator** (1 hour)

**File**: `gui/src/components/ai/TestGenerator.tsx`

```typescript
// What it shows:
- "Generate Tests" button
- Framework selector (jest, pytest, etc)
- Current function scope selector
- Generate button
- Preview generated tests
- Insert button

// Redux integration:
- dispatch(addMessage({role: 'assistant', content: generatedTests}))

// IPC integration:
- window.codinAPI.agent.generateTests(code, framework, scope)
```

#### 6. **DocGenerator** (1 hour)

**File**: `gui/src/components/ai/DocGenerator.tsx`

```typescript
// What it shows:
- "Generate Docs" button
- Format selector (JSDoc, docstring, etc)
- Generate button
- Preview docs
- Insert button

// Redux integration:
- dispatch(addMessage({...}))

// IPC integration:
- window.codinAPI.agent.generateDocs(code, format)
```

#### 7. **RefactorMenu** (1 hour)

**File**: `gui/src/components/ai/RefactorMenu.tsx`

```typescript
// What it shows:
- "Refactor" context menu
- Suggestions list:
  - Extract function
  - Extract variable
  - Extract class
  - Inline function
  - Rename
- Apply button for each

// Redux integration:
- dispatch(applyRefactor(refactor))

// IPC integration:
- window.codinAPI.agent.suggestRefactors(code, language)
```

### 🎨 STYLING (8 Hours)

#### 1. **Create CSS Variables** (1 hour)

**File**: `gui/src/styles/variables.css`

```css
/* Colors */
--bg-primary: #1e1e1e;
--bg-secondary: #252526;
--bg-tertiary: #2d2d30;
--fg-primary: #d4d4d4;
--fg-secondary: #858585;

/* Accents */
--accent-primary: #007acc;
--accent-hover: #1177bb;
--accent-active: #005a9e;

/* Semantics */
--error: #f14c4c;
--warning: #ce9178;
--success: #6a9955;
--info: #17a2b8;

/* Spacing */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;

/* Font */
--font-family: "Fira Code", monospace;
--font-size-base: 13px;
--font-size-sm: 11px;
--font-size-lg: 15px;

/* Sizes */
--activity-bar-width: 50px;
--sidebar-width: 300px;
--bottom-panel-height: 300px;
--tab-height: 35px;
--statusbar-height: 25px;
```

#### 2. **ActivityBar Styling** (0.5 hours)

**File**: `gui/src/styles/ActivityBar.css`

#### 3. **EditorArea Styling** (1 hour)

**File**: `gui/src/styles/EditorArea.css`

#### 4. **FileTree Styling** (0.5 hours)

**File**: `gui/src/styles/FileTree.css`

#### 5. **Panel Styling** (1.5 hours)

**File**: `gui/src/styles/Panels.css`

#### 6. **Modal/Dialog Styling** (1.5 hours)

**File**: `gui/src/styles/Modals.css`

#### 7. **Terminal Styling** (0.5 hours)

**File**: `gui/src/styles/Terminal.css`

#### 8. **Dark/Light Theme** (1.5 hours)

**File**: `gui/src/styles/themes.css`

### 🚀 AI INTEGRATION (12 Hours)

#### 1. **Setup LLM Manager** (2 hours)

- Auto-download models on first run
- Model selection UI
- Model info display (size, speed, accuracy)
- Download progress indicator

#### 2. **Implement Completions** (3 hours)

- Inline completions (after typing)
- Multi-line completions
- Streaming from llama.cpp
- Cache previous requests
- Debounce requests

#### 3. **Implement Chat Interface** (2 hours)

- Send message flow
- Receive streaming response
- Display response as it arrives
- Context gathering (current file, selection)
- Message history

#### 4. **Implement Code Actions** (3 hours)

- Explain code
- Generate tests
- Generate docs
- Suggest refactors
- Fix errors

#### 5. **Implement Voice** (2 hours)

- Speech recognition (Whisper)
- Text-to-speech (piper TTS)
- Voice commands
- Language detection

---

## 🌍 MULTILINGUAL IMPLEMENTATION (6 Hours)

### 1. **UI Translation** (2 hours)

```typescript
// Create translation files:
// gui/src/i18n/en.ts
// gui/src/i18n/hi.ts
// gui/src/i18n/ta.ts
// gui/src/i18n/as.ts

// Every string key:
export const strings = {
  menu: {
    file: "File", // English
  },
};
```

### 2. **Component Translation** (2 hours)

```typescript
// In each component:
import { useTranslation } from 'react-i18next'

export function MyComponent() {
  const { t } = useTranslation()
  return <div>{t('menu.file')}</div>
}
```

### 3. **Theme RTL Support** (1 hour)

```css
/* For Tamil/Assamese RTL */
[dir="rtl"] {
  direction: rtl;
  text-align: right;
}
```

### 4. **Language Switching** (1 hour)

```typescript
// Settings UI to switch language
// Save to localStorage
// Reload UI with new language
```

---

## ✅ BUILD ORDER (DO THIS)

### Day 1 (8 Hours) - Core Components

1. GitPanel (1h)
2. SearchPanel (1h)
3. DebugPanel (1.5h)
4. ProblemsPanel (0.5h)
5. OutputPanel (0.5h)
6. ExtensionsPanel (1h)
7. SettingsPanel (1.5h)

### Day 2 (8 Hours) - Modals & Status

1. StatusBar (0.5h)
2. Breadcrumb (0.5h)
3. TabBar (1h)
4. CommandPalette (1h)
5. QuickOpen (0.5h)
6. GoToLine (0.5h)
7. SearchBox (1h)
8. Additional Modals (2h)

### Day 3 (8 Hours) - CSS & Styling

1. CSS Variables (1h)
2. Component Styling (5h)
3. Theme System (2h)

### Day 4 (8 Hours) - AI Integration

1. Completions (2h)
2. Chat (2h)
3. Code Actions (2h)
4. Voice (2h)

### Day 5 (4 Hours) - Multilingual

1. Translation Files (1h)
2. Component i18n (1h)
3. Language Switching (1h)
4. RTL Support (1h)

---

## 🏁 FINAL STEPS (1-2 Hours)

### 1. Testing

- Open each file
- Use each feature
- Check for errors

### 2. Performance Optimization

- Check startup time (target: < 2s)
- Check memory (target: < 500MB base)

### 3. Packaging

```bash
npm run dist:win  # or dist:mac / dist:linux
```

### 4. Release

- Push to GitHub
- Create release notes
- Share with community

---

## 📊 PROGRESS TRACKER

Copy to a separate file and update daily:

```
Day 1: [ ] [ ] [ ] [ ] [ ] [ ] [ ]  // 7 components
Day 2: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]  // 8 items
Day 3: [ ] [ ] [ ] [ ]  // 4 major tasks
Day 4: [ ] [ ] [ ] [ ]  // 4 core features
Day 5: [ ] [ ] [ ] [ ]  // 4 languages

Legend:
[x] = Done
[ ] = Not done
[/] = In progress
```

---

**That's everything needed to make CodIn ELITE complete from A to Z.**

**Total time: 40-50 hours of focused development**  
**Starting from what's already done (Phase 1-2a), you can be production-ready in 2-3 days of full-time work.**

**Next step: Start with Day 1 components. Let's go! 🚀**
