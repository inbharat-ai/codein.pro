# 🔌 CodIn ELITE - Backend API Reference

Complete documentation of all `window.codinAPI` methods available from React components.

---

## Overview

All backend operations are accessed via `window.codinAPI`, which is injected by the Electron preload script. The API is organized into service namespaces:

```typescript
window.codinAPI.fs; // File system operations
window.codinAPI.git; // Git operations
window.codinAPI.terminal; // Terminal operations
window.codinAPI.models; // Model management
window.codinAPI.agent; // AI agent (completions, voice, etc)
```

All methods return Promises. All errors throw exceptions with message property.

---

## File System Service (`window.codinAPI.fs`)

### File Operations

#### `readFile(filePath: string, encoding?: string): Promise<string>`

Read file contents as text.

```typescript
const content = await window.codinAPI.fs.readFile("/path/to/file.js", "utf-8");
```

**Parameters**:

- `filePath` (required): Absolute file path
- `encoding` (optional): 'utf-8' (default), 'ascii', 'binary'

**Returns**: File contents as string

**Throws**: `{ message: "ENOENT: File not found" }`

**Usage**: Load file into editor

---

#### `writeFile(filePath: string, content: string, encoding?: string): Promise<void>`

Write content to file. Creates file if it doesn't exist, overwrites if it does.

```typescript
await window.codinAPI.fs.writeFile("/path/to/file.js", 'console.log("hello");');
```

**Parameters**:

- `filePath` (required): Absolute file path
- `content` (required): Text to write
- `encoding` (optional): 'utf-8' (default)

**Returns**: undefined (void)

**Throws**: `{ message: "EACCES: Permission denied" }`

**Usage**: Auto-save editor content

---

#### `deleteFile(filePath: string): Promise<void>`

Delete a file permanently.

```typescript
await window.codinAPI.fs.deleteFile("/path/to/file.js");
```

**Parameters**:

- `filePath` (required): Absolute file path

**Throws**: `{ message: "ENOENT: File not found" }`

---

#### `copyFile(source: string, destination: string): Promise<void>`

Copy file to new location.

```typescript
await window.codinAPI.fs.copyFile("/path/file.js", "/path/file-backup.js");
```

---

#### `moveFile(source: string, destination: string): Promise<void>`

Move/rename file.

```typescript
await window.codinAPI.fs.moveFile("/path/old-name.js", "/path/new-name.js");
```

---

### Directory Operations

#### `listFiles(directoryPath: string): Promise<FileInfo[]>`

List files in directory.

```typescript
const files = await window.codinAPI.fs.listFiles("/path/to/dir");
// Returns:
// [
//   { name: 'file.js', path: '/path/to/dir/file.js', isDirectory: false, size: 1024 },
//   { name: 'subdir', path: '/path/to/dir/subdir', isDirectory: true, size: 0 },
// ]
```

**Parameters**:

- `directoryPath` (required): Absolute directory path

**Returns**: Array of FileInfo objects

```typescript
interface FileInfo {
  name: string; // File/folder name
  path: string; // Absolute path
  isDirectory: boolean; // Is it a directory?
  size: number; // File size in bytes
  modified: number; // Unix timestamp
  mode: number; // File permissions
}
```

**Usage**: File tree explorer

---

#### `createDirectory(directoryPath: string): Promise<void>`

Create a directory.

```typescript
await window.codinAPI.fs.createDirectory("/path/to/new-dir");
```

**Throws**: `{ message: "EEXIST: Directory already exists" }`

---

#### `deleteDirectory(directoryPath: string, recursive?: boolean): Promise<void>`

Delete a directory.

```typescript
await window.codinAPI.fs.deleteDirectory("/path/to/dir", true);
```

**Parameters**:

- `directoryPath` (required): Absolute directory path
- `recursive` (optional): Delete contents recursively? true/false

---

### Search & Watch Operations

#### `searchFiles(query: string, directoryPath?: string, options?: SearchOptions): Promise<SearchResult[]>`

Search files by name or content.

```typescript
const results = await window.codinAPI.fs.searchFiles("import", "./src", {
  matchCase: false,
  matchWholeWord: true,
  searchContent: true,
  maxResults: 100,
});
```

**Parameters**:

- `query` (required): Search string
- `directoryPath` (optional): Base directory (default: workspace)
- `options` (optional):
  ```typescript
  {
    matchCase?: boolean;           // case-sensitive search
    matchWholeWord?: boolean;       // whole word match
    useRegex?: boolean;             // regex pattern?
    searchContent?: boolean;        // search file contents?
    excludePatterns?: string[];     // .gitignore patterns to exclude
    maxResults?: number;            // max results to return (default: 1000)
  }
  ```

**Returns**:

```typescript
interface SearchResult {
  file: string; // File path
  matches: {
    line: number; // Line number (0-based)
    column: number; // Column number
    text: string; // Line content
    startColumn: number; // Match start column
    endColumn: number; // Match end column
  }[];
}
```

**Usage**: Global search feature

---

#### `watchFile(filePath: string, callback: (change: FileChangeEvent) => void): Promise<WatcherId>`

Watch file for changes and call callback when it changes.

```typescript
const watcherId = await window.codinAPI.fs.watchFile(
  "/path/file.js",
  (change) => {
    console.log(change.type); // 'add', 'change', 'unlink', 'addDir', 'unlinkDir'
    console.log(change.path);
  },
);

// Stop watching
await window.codinAPI.fs.unwatch(watcherId);
```

**FileChangeEvent**:

```typescript
{
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
  path: string;
  timestamp: number;
}
```

**Usage**: Detect external file changes, live reload

---

#### `replaceInFiles(query: string, replacement: string, directoryPath?: string, options?: SearchOptions): Promise<number>`

Replace text in multiple files.

```typescript
const changedCount = await window.codinAPI.fs.replaceInFiles(
  "oldText",
  "newText",
  "./src",
  { matchCase: false },
);
```

**Returns**: Number of files changed

**Usage**: Find and replace globally

---

### File Encoding & Info

#### `getFileEncoding(filePath: string): Promise<string>`

Detect file encoding.

```typescript
const encoding = await window.codinAPI.fs.getFileEncoding("/path/file.txt");
// Returns: 'utf-8', 'utf-16', 'ascii', etc.
```

---

#### `getFileStats(filePath: string): Promise<FileStats>`

Get detailed file information.

```typescript
const stats = await window.codinAPI.fs.getFileStats("/path/file.js");
```

**Returns**:

```typescript
interface FileStats {
  size: number; // bytes
  modified: number; // Unix timestamp
  created: number; // Unix timestamp
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  permissions: number; // Unix permissions (755, etc)
}
```

---

## Git Service (`window.codinAPI.git`)

### Status

#### `getStatus(): Promise<GitStatus>`

Get current git status.

```typescript
const status = await window.codinAPI.git.getStatus();
```

**Returns**:

```typescript
interface GitStatus {
  currentBranch: string; // e.g., 'main'
  changes: GitFile[]; // Modified/added/deleted files
  stagedChanges: GitFile[]; // Files in staging area
  untrackedFiles: string[]; // New untracked files
  conflicts: string[]; // Files with merge conflicts
  isClean: boolean; // No changes?
}

interface GitFile {
  path: string;
  status: "M" | "A" | "D" | "U" | "?" | "R"; // M=modified, A=added, D=deleted, U=unmerged, ?=untracked, R=renamed
  staged: boolean; // Is it staged?
  stagedStatus?: "M" | "A" | "D" | "R";
}
```

**Usage**: Show git status in Git panel

---

#### `getDiff(filePath?: string): Promise<string>`

Get diff for file or all changes.

```typescript
const diff = await window.codinAPI.git.getDiff("/path/file.js");
// Returns: unified diff format
```

**Parameters**:

- `filePath` (optional): Single file diff, all if omitted

**Returns**: Unified diff format (as string)

**Usage**: Diff viewer in Git panel

---

### Staging & Committing

#### `stageFile(filePath: string | string[]): Promise<void>`

Stage file(s) for commit.

```typescript
await window.codinAPI.git.stageFile("/path/file.js");
// or multiple
await window.codinAPI.git.stageFile(["/path/file1.js", "/path/file2.js"]);
```

---

#### `unstageFile(filePath: string | string[]): Promise<void>`

Remove file(s) from staging area.

```typescript
await window.codinAPI.git.unstageFile("/path/file.js");
```

---

#### `stageAll(): Promise<void>`

Stage all changes.

```typescript
await window.codinAPI.git.stageAll();
```

---

#### `commit(message: string, options?: CommitOptions): Promise<string>`

Commit staged changes.

```typescript
const commitHash = await window.codinAPI.git.commit("Add new feature", {
  amend: false,
  sign: false,
});
```

**Parameters**:

- `message` (required): Commit message
- `options` (optional):
  ```typescript
  {
    amend?: boolean;        // Amend previous commit?
    sign?: boolean;         // GPG sign?
    author?: string;        // Override author "Name <email>"
  }
  ```

**Returns**: Commit hash (SHA1)

**Throws**: `{ message: "nothing to commit" }`

**Usage**: Commit UI in Git panel

---

### Branches

#### `getBranches(): Promise<GitBranch[]>`

List all branches.

```typescript
const branches = await window.codinAPI.git.getBranches();
```

**Returns**:

```typescript
interface GitBranch {
  name: string; // e.g., 'main'
  current: boolean; // Currently checked out?
  remote?: string; // Remote branch? (e.g., 'origin/main')
  tracking?: string; // Tracking branch?
  lastCommit: string; // Latest commit message
}
```

---

#### `switchBranch(branchName: string): Promise<void>`

Checkout a branch.

```typescript
await window.codinAPI.git.switchBranch("develop");
```

**Throws**: `{ message: "branch not found" }`

---

#### `createBranch(branchName: string, baseBranch?: string): Promise<void>`

Create new branch.

```typescript
await window.codinAPI.git.createBranch("feature/new-ui", "main");
```

---

#### `deleteBranch(branchName: string, force?: boolean): Promise<void>`

Delete a branch.

```typescript
await window.codinAPI.git.deleteBranch("feature/old", true);
```

---

### Push, Pull, History

#### `push(options?: PushOptions): Promise<string>`

Push to remote.

```typescript
const result = await window.codinAPI.git.push({
  remote: "origin",
  branch: "main",
  force: false,
  setUpstream: true,
});
```

**Options**:

```typescript
{
  remote?: string;          // 'origin' (default)
  branch?: string;          // Current branch (default)
  force?: boolean;          // Force push?
  setUpstream?: boolean;    // Set upstream?
}
```

**Returns**: Push result message

---

#### `pull(options?: PullOptions): Promise<string>`

Pull from remote.

```typescript
await window.codinAPI.git.pull({
  remote: "origin",
  rebase: false,
});
```

**Returns**: Pull result

---

#### `getLog(count?: number): Promise<GitCommit[]>`

Get commit history.

```typescript
const commits = await window.codinAPI.git.getLog(50);
```

**Parameters**:

- `count` (optional): Number of commits (default: 100)

**Returns**:

```typescript
interface GitCommit {
  hash: string; // Commit SHA
  author: string; // Author name
  email: string; // Author email
  date: number; // Unix timestamp
  message: string; // Commit message
  parentHash: string; // Parent commit SHA
  files: {
    path: string;
    status: "M" | "A" | "D";
    additions: number;
    deletions: number;
  }[];
}
```

---

## Terminal Service (`window.codinAPI.terminal`)

### Terminal Control

#### `execute(command: string, cwd?: string, options?: ExecOptions): Promise<ExecResult>`

Execute shell command.

```typescript
const result = await window.codinAPI.terminal.execute(
  "npm run build",
  "./project",
);
```

**Parameters**:

- `command` (required): Shell command to execute
- `cwd` (optional): Working directory
- `options` (optional):
  ```typescript
  {
    env?: Record<string, string>;  // Environment variables
    shell?: string;                // Shell to use ('cmd.exe', 'bash', etc)
    timeout?: number;              // Kill after N milliseconds
  }
  ```

**Returns**:

```typescript
interface ExecResult {
  stdout: string; // Output
  stderr: string; // Errors
  exitCode: number; // Exit code
  signal?: string; // Kill signal if terminated
}
```

**Usage**: Run build commands, scripts

---

### PTY (Terminal Emulation)

#### `createTerminal(commands?: string, cwd?: string): Promise<TerminalId>`

Create interactive terminal session.

```typescript
const terminalId = await window.codinAPI.terminal.createTerminal(
  "",
  "/project",
);
```

**Returns**: Terminal ID for managing this terminal

**Usage**: Interactive terminal in UI

---

#### `writeToTerminal(terminalId: TerminalId, input: string): Promise<void>`

Send input to terminal.

```typescript
await window.codinAPI.terminal.writeToTerminal(terminalId, "npm install\n");
```

---

#### `readFromTerminal(terminalId: TerminalId, callback: (data: string) => void): Promise<void>`

Listen for terminal output.

```typescript
await window.codinAPI.terminal.readFromTerminal(terminalId, (output) => {
  console.log("Terminal output:", output);
  // Update UI with output
});
```

**Usage**: Display terminal output in xterm.js

---

#### `closeTerminal(terminalId: TerminalId): Promise<void>`

Close terminal session.

```typescript
await window.codinAPI.terminal.closeTerminal(terminalId);
```

---

#### `resizeTerminal(terminalId: TerminalId, cols: number, rows: number): Promise<void>`

Resize terminal.

```typescript
await window.codinAPI.terminal.resizeTerminal(terminalId, 120, 40);
```

**Usage**: When window resizes

---

## Model Manager Service (`window.codinAPI.models`)

### Model Listing & Management

#### `listModels(): Promise<Model[]>`

List available local models.

```typescript
const models = await window.codinAPI.models.listModels();
```

**Returns**:

```typescript
interface Model {
  id: string; // e.g., 'qwen2.5-coder-1.5b'
  name: string; // Display name
  size: number; // Size in MB
  downloaded: boolean; // Is it downloaded?
  path: string; // Local path to model file
  quantization: string; // 'Q4_0', 'Q5_K_M', etc
  architecture: string; // 'LLaMA', 'Mistral', etc
  context: number; // Context window size
  speed: number; // Tokens/sec estimate
  accuracy: number; // Accuracy score (0-100)
}
```

---

#### `downloadModel(modelId: string, callback?: (progress: DownloadProgress) => void): Promise<void>`

Download model from HuggingFace.

```typescript
await window.codinAPI.models.downloadModel("qwen2.5-coder-1.5b", (progress) => {
  console.log(`Downloaded: ${progress.downloaded}/${progress.total} MB`);
  console.log(`Speed: ${progress.speed} MB/s`);
});
```

**Parameters**:

- `callback` (optional): Progress updates

**DownloadProgress**:

```typescript
{
  downloaded: number; // MB downloaded
  total: number; // Total MB
  speed: number; // MB/s
  eta: number; // Seconds remaining
}
```

**Usage**: Model downloader UI

---

#### `setActiveModel(modelId: string): Promise<void>`

Switch active model for completions.

```typescript
await window.codinAPI.models.setActiveModel("deepseek-r1-7b");
```

---

#### `getActiveModel(): Promise<Model>`

Get currently active model.

```typescript
const model = await window.codinAPI.models.getActiveModel();
console.log(model.name); // "DeepSeek R1 7B"
```

---

#### `deleteModel(modelId: string): Promise<void>`

Delete a model.

```typescript
await window.codinAPI.models.deleteModel("old-model-id");
```

---

## Agent Service (`window.codinAPI.agent`)

### Completions

#### `generateCompletion(prompt: string, options?: CompletionOptions): Promise<string>`

Generate single completion (blocking).

```typescript
const completion = await window.codinAPI.agent.generateCompletion(
  'function hello() {\n  console.log("',
  { temperature: 0.7, maxTokens: 100 },
);
```

**Parameters**:

- `prompt` (required): The completion prompt
- `options` (optional):
  ```typescript
  {
    temperature?: number;    // 0.0-2.0 (default: 0.7)
    topP?: number;           // 0.0-1.0 (default: 0.95)
    maxTokens?: number;      // Max output (default: 2000)
    model?: string;          // Override active model
    stopSequences?: string[]; // Stop at these strings
  }
  ```

**Returns**: Generated text

**Usage**: Inline completions

---

#### `streamCompletion(prompt: string, options?: CompletionOptions, onChunk?: (chunk: string) => void): Promise<string>`

Generate completion with streaming (tokens as they arrive).

```typescript
const fullText = await window.codinAPI.agent.streamCompletion(
  "Explain this code:\n" + selectedCode,
  { maxTokens: 2000 },
  (chunk) => {
    console.log("Received:", chunk);
    // Update UI with new text
  },
);
```

**Returns**: Complete generated text (same as streaming received)

**Usage**: Chat interface

---

### Code-Specific Features

#### `explainCode(code: string, language?: string): Promise<string>`

Explain what code does.

```typescript
const explanation = await window.codinAPI.agent.explainCode(
  "for (let i = 0; i < arr.length; i++) { sum += arr[i]; }",
  "javascript",
);
```

---

#### `generateTests(code: string, framework?: string, scope?: 'function' | 'file'): Promise<string>`

Generate unit tests.

```typescript
const tests = await window.codinAPI.agent.generateTests(
  existingCode,
  "jest",
  "function",
);
```

---

#### `generateDocs(code: string, format?: 'jsdoc' | 'docstring' | 'comment'): Promise<string>`

Generate documentation.

```typescript
const docs = await window.codinAPI.agent.generateDocs(code, "jsdoc");
```

---

#### `suggestRefactors(code: string, language?: string): Promise<Refactor[]>`

Suggest code refactorings.

```typescript
const suggestions = await window.codinAPI.agent.suggestRefactors(
  code,
  "python",
);
```

**Returns**:

```typescript
interface Refactor {
  type: 'extract-function' | 'extract-variable' | 'rename' | ...
  description: string;
  code: string;          // Refactored code
  rangeStart: number;    // Character position in original
  rangeEnd: number;
}
```

---

### Voice Features

#### `startSpeechToText(language?: string): Promise<SessionId>`

Start listening for voice input.

```typescript
const sessionId = await window.codinAPI.agent.startSpeechToText("en");
```

**Parameters**:

- `language`: 'en' (English), 'hi' (Hindi), 'ta' (Tamil), 'as' (Assamese)

**Returns**: Session ID for managing this recording

---

#### `onTranscript(sessionId: SessionId, callback: (text: string) => void): Promise<void>`

Listen for transcribed text.

```typescript
await window.codinAPI.agent.onTranscript(sessionId, (text) => {
  console.log("Heard:", text);
  // Update chat/command input with text
});
```

---

#### `stopSpeechToText(sessionId: SessionId): Promise<string>`

Stop listening and get final text.

```typescript
const finalText = await window.codinAPI.agent.stopSpeechToText(sessionId);
```

---

#### `textToSpeech(text: string, language?: string, voice?: string): Promise<void>`

Speak text.

```typescript
await window.codinAPI.agent.textToSpeech(
  "Code generation complete",
  "en",
  "female", // 'male' or 'female'
);
```

---

### Translation

#### `translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string>`

Translate text.

```typescript
const hindi = await window.codinAPI.agent.translate("Hello world", "en", "hi");
```

**Supported**: 'en', 'hi', 'ta', 'as'

---

### Utilities

#### `getSupportedLanguages(): Promise<string[]>`

Get supported languages.

```typescript
const langs = await window.codinAPI.agent.getSupportedLanguages();
// ['en', 'hi', 'ta', 'as']
```

---

#### `detectLanguage(text: string): Promise<string>`

Detect language of text.

```typescript
const lang = await window.codinAPI.agent.detectLanguage("हैलो दुनिया");
// 'hi' (Hindi)
```

---

## Error Handling

All services throw errors with standardized format:

```typescript
try {
  const content = await window.codinAPI.fs.readFile("/path/that/doesnt/exist");
} catch (error) {
  console.error(error.message); // "ENOENT: File not found"
  console.error(error.code); // "ENOENT"
  console.error(error.filePath); // "/path/that/doesnt/exist"
}
```

Common error codes:

- `ENOENT`: File not found
- `EACCES`: Permission denied
- `EISDIR`: Is a directory
- `EEXIST`: Already exists
- `ETIMEDOUT`: Operation timed out
- `TIMEOUT`: Request timeout

---

## Usage Examples

### Loading a File into Editor

```typescript
const content = await window.codinAPI.fs.readFile(filePath);
dispatch(setEditorValue(content));
```

### Saving File

```typescript
const content = useSelector((state) => state.editor.content);
await window.codinAPI.fs.writeFile(activeFile, content);
dispatch(saveFile(activeFile));
```

### Git Commit

```typescript
const message = "Add new feature";
await window.codinAPI.git.stageAll();
const commitHash = await window.codinAPI.git.commit(message);
dispatch(addCommit({ hash: commitHash, message }));
```

### AI Chat

```typescript
const response = await window.codinAPI.agent.streamCompletion(
  `Context: ${selectedCode}\n\nQuestion: ${userMessage}`,
  { maxTokens: 2000 },
  (chunk) => dispatch(addChatChunk(chunk)),
);
dispatch(addMessage({ role: "assistant", content: response }));
```

### Voice to Text

```typescript
const sessionId = await window.codinAPI.agent.startSpeechToText("en");

await window.codinAPI.agent.onTranscript(sessionId, (text) => {
  dispatch(setUserInput(text));
});

// User says something...
// After they stop:
const transcript = await window.codinAPI.agent.stopSpeechToText(sessionId);
```

---

## Performance Notes

- **Completions**: First token in ~100-200ms (Qwen1.5B), slower for bigger models
- **File operations**: < 100ms for typical files
- **Git operations**: < 500ms depending on repo size
- **Terminal**: Real-time with xterm.js rendering
- **Search**: Linear time proportional to codebase size

---

## Debugging

Enable debug logging:

```typescript
// React component
console.log("IPC call:", method, args);
const result = await window.codinAPI.service.method(...args);
console.log("IPC result:", result);
```

Redux DevTools shows all actions:

- `git/setChanges` → git state updated
- `editor/setEditorValue` → file content changed
- `copilot/addMessage` → new chat message

---

This completes the backend API reference. Use these methods to build all frontend components!
