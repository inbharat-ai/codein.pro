# CodIn Features Showcase

This document showcases all features of CodIn with examples and screenshots.

## 🎭 Mode Selector

CodIn offers **4 distinct modes** for different coding workflows:

### Ask Mode (Default)

**Use case**: General questions, code explanations, debugging help

**Example**:

```
User: How do I implement a binary search in Python?
Assistant: [Provides explanation with code example]
```

**Features**:

- Open-ended conversation
- Code context from selected files
- Tools disabled (no file modifications)

### Plan Mode

**Use case**: Breaking down complex tasks into steps

**Example**:

```
User: I need to refactor this codebase to use dependency injection
Assistant: Here's a structured plan:
1. Identify all direct dependencies
2. Create an IoC container
3. Register services
4. Update constructors
5. Add tests
```

**Features**:

- Structured output
- Step-by-step breakdowns
- Tools disabled (planning only)

### Agent Mode

**Use case**: Autonomous multi-step task execution

**Example**:

```
User: Add error handling to all API endpoints and write tests
Agent: [Automatically analyzes files, makes changes, runs tests]
```

**Features**:

- Full tool access (read/write files, terminal, etc.)
- Multi-step execution
- Self-correcting

### Implement Mode

**Use case**: Deterministic, reviewable file changes

**Example**:

```
User: Refactor ProductCard component to use TypeScript interfaces

Response (JSON):
{
  "plan": ["1. Add interface definitions", "2. Update component props"],
  "patches": [
    {
      "path": "src/components/ProductCard.tsx",
      "diff": "@@ -1,3 +1,8 @@\n+interface Product {\n+  id: string;\n..."
    }
  ],
  "new_files": [],
  "run_instructions": "npm run typecheck",
  "explanation_user_language": "Added TypeScript interfaces"
}
```

**Features**:

- Strict JSON format
- Preview before applying
- Unified diff patches
- One-click rollback
- Tools disabled (structured output only)

## 🔍 Edit Contract System

### Contract Validation

- Automatic JSON repair (extracts from wrapped text)
- Schema validation with clear error messages
- Preview panel shows plan and affected files

### Preview Panel

```
✅ Plan
  • Add error boundary to Dashboard
  • Update error handling in API calls

📝 Files to Modify
  • src/components/Dashboard.tsx (12 lines changed)
  • src/api/client.ts (5 lines changed)

▶️ Actions
  [Apply] [Cancel]
```

### Apply & Rollback

- Creates backup before applying
- Applies patches atomically
- Rollback restores from backup
- Backup ID stored in workspace state

## 🤖 CodIn Agent & Model Manager

### CodIn Agent Service

- Auto-starts on extension activation
- HTTP server on `localhost:43120`
- Endpoints:
  - `/health` - Health check
  - `/models` - List models
  - `/models/download` - Download GGUF model
  - `/models/import` - Import local model
  - `/models/activate` - Set active model
  - `/router` - Smart routing decisions
  - `/translate` - Translation stub
  - `/voice/stt` - Speech-to-text stub
  - `/voice/tts` - Text-to-speech stub

### Model Manager UI

Location: **Settings → Models**

**Features**:

- View active coder and reasoner models
- Import local GGUF models
- Download models from URLs
- Activate models for specific roles

**Smart Router**:

- Automatic local vs cloud selection
- Coder for simple tasks, reasoner for complex
- Heuristics based on:
  - Prompt keywords (architecture, refactor, migration, etc.)
  - Context size (> 12k chars → reasoner)
  - User preference (accuracy mode)

## 🎤 Voice Panel

Location: **Below chat input (microphone icon)**

**Supported Languages**:

- 🇮🇳 Hindi (हिन्दी)
- 🇮🇳 Assamese (অসমীয়া)
- 🇮🇳 Tamil (தமிழ்)
- 🇬🇧 English

**Workflow**:

1. Click microphone icon
2. Select language
3. Grant browser microphone permission
4. Speak query
5. Text appears in input (auto-translated if needed)

**Offline Support**:

- Browser Web Speech API (Chrome, Edge)
- OS TTS for responses
- Translation via CodIn Agent when available

## 🏃 Run Panel

Location: **Settings → Run**

**Auto-Detection**:

- Next.js projects → `npm run dev` (port 3000)
- Vite projects → `npm run dev` (port 5173)
- Create React App → `npm start` (port 3000)
- Static HTML → `python -m http.server 8000`

**Features**:

- Command override input
- Permission gating (once / always allow)
- Terminal execution in VS Code
- Preview URL detection
- Run/Stop/Preview buttons

**Security**:

- All commands require explicit confirmation
- "Always allow" option persists per workspace
- Workspace state stored in `.vscode/`

## 🔀 Git Actions

Location: **Settings → Git**

### Status

```
Branch: main
Changes:
  M  src/app.ts
  A  src/utils.ts
  D  old-file.js
```

### Commit

- Enter commit message
- Auto-stage all changes (optional)
- Requires confirmation
- Shows commit hash

### Push

- Push to current branch
- Specify remote (default: origin)
- Requires confirmation
- Shows push output

### Checkout

- Switch to existing branch
- Create new branch with `-b` flag
- Requires confirmation

**Security**:

- All git operations require confirmation
- Commands sanitized (no shell injection)
- Git root auto-detected

## 🚀 Deploy Helpers

Location: **Settings → Deploy**

### Vercel

Generates `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

Instructions:

```
Run `vercel` from the project root,
then select the created settings.
```

### Netlify

Generates `netlify.toml`:

```toml
[build]
command = "npm run build"
publish = "dist"
```

Instructions:

```
Run `netlify deploy` from the project
root and follow the prompts.
```

### Firebase

Generates `firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

Instructions:

```
Run `firebase init hosting` then
`firebase deploy` from the project root.
```

## 🔌 MCP Integration

Location: **Settings → MCP**

**Current Status**: Stub implementation (ready for future)

**Planned Features**:

- List MCP servers and tools
- Enable/disable servers
- Tool permission management
- Activity monitoring

## 🔐 Privacy & Security

### Telemetry

- **OFF by default**
- Can be enabled in settings
- No sensitive data collected

### API Keys

- Stored in VS Code secret storage
- Never logged or transmitted (except to configured endpoints)
- Encrypted at rest

### Permission Gates

All potentially dangerous actions require explicit confirmation:

- Run commands (terminal execution)
- Git operations (commit, push)
- Deploy operations (config generation)
- File modifications (Agent mode)

### Edit Backups

- All Implement mode changes backed up
- Backups stored in `~/.vscode/globalStorage/codin/contract-backups/`
- Persistent until manually deleted
- One-click rollback

## 🧪 Testing

### Unit Tests (7 total)

**Contract Validation**:

```javascript
✔ validateEditContract accepts valid payload
✔ validateEditContract repairs JSON wrapped in text
```

**Diff Apply**:

```javascript
✔ applyUnifiedDiff applies a simple hunk
✔ applyUnifiedDiff preserves trailing newline
```

**Router**:

```javascript
✔ router chooses cloud when local model missing
✔ router chooses reasoner for deep planning
```

**Model Store**:

```javascript
✔ model store persists models
```

### CI Pipeline

GitHub Actions workflow: `.github/workflows/codin-tests.yml`

- Runs on: Pull requests, pushes to main
- Node 20 environment
- Steps:
  1. Run unit tests
  2. Build extension
  3. Package .vsix

## 📊 Performance

### CodIn Agent

- Lightweight HTTP service (~10MB memory)
- Fast startup (<1s)
- Efficient model routing

### Extension

- Lazy loading for components
- Minimal impact on VS Code performance
- Webview caching for instant reloads

### Local Models

- GGUF format support
- Efficient quantization
- GPU acceleration (when available via Ollama)

## 🌍 Multilingual Support

### Translation Hook

- Detects user language in input
- Auto-translates to English for model
- Model responds in original language

### Supported Languages

- Hindi (हिन्दी)
- Assamese (অসমীয়া)
- Tamil (தமிழ்)
- English (and many more via translation API)

### Voice + Translation

- Speak in Hindi/Assamese/Tamil
- Translation to English for processing
- Response in original language

## 🎓 Learning Resources

### First-Time Setup

1. Install extension
2. Configure at least one model (local or cloud)
3. Try Ask mode with simple queries
4. Experiment with Implement mode for safe edits

### Best Practices

- **Ask mode**: Exploratory questions, learning
- **Plan mode**: Complex task breakdowns
- **Agent mode**: Automated refactoring, bulk changes
- **Implement mode**: Surgical edits, contract-based changes

### Keyboard Shortcuts

- `Ctrl+L` / `Cmd+L` - Focus chat input
- `Ctrl+Shift+L` / `Cmd+Shift+L` - Focus without clearing
- `Ctrl+I` / `Cmd+I` - Inline edit mode
- `Escape` - Exit edit mode

## 📞 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: See `/docs` folder
- **Contributing**: See CONTRIBUTING.md
