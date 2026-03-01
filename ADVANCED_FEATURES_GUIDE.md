# 🚀 CodIn - Advanced Features: Debug, Research & Agent

## Overview

CodIn now includes three powerful advanced features:

1. **Debug Panel** - Full-featured debugger like Cursor/VSCode
2. **Research Assistant** - Web research, documentation, code examples
3. **Enhanced Agent** - AI-powered coding with research capabilities

---

## 1. 🔧 Debug Panel

### Features

**Breakpoint Management**

- Add/remove breakpoints at any line
- Enable/disable breakpoints without removing them
- Conditional breakpoints (break if condition is true)
- Breakpoint list with file location and status

**Execution Control**

- ▶️ **Start** - Begin debugging (F5)
- ⏸️ **Pause** - Pause execution to inspect state (F6)
- ⤵️ **Step Over** - Execute current line, skip function calls (F10)
- ⬇️ **Step Into** - Enter into function calls (F11)
- ⬆️ **Step Out** - Exit current function, return to caller (Shift+F11)
- ⏹️ **Stop** - Stop debugging (Shift+F5)

**Call Stack Inspection**

- View full call stack when paused
- Click stack frames to inspect different scopes
- See file name, line number, and function name for each frame
- Visual indicator for current/selected frame

**Variables Inspector**

- View all variables in current scope
- Display variable name, type, and value
- Expandable objects and arrays
- Real-time value updates as code executes

**Watch Expressions**

- Add custom expressions to watch
- Monitor specific variables or expressions
- Auto-update values as code runs
- Remove expressions you no longer need

**Debug Console**

- Real-time logging and output
- Show all debug events (breakpoint hit, step, etc.)
- Color-coded output for different message types
- Scrollable history

### Keyboard Shortcuts

| Action         | Shortcut  |
| -------------- | --------- |
| Start/Continue | F5        |
| Pause          | F6        |
| Step Over      | F10       |
| Step Into      | F11       |
| Step Out       | Shift+F11 |
| Stop           | Shift+F5  |

### Usage Example

```typescript
// 1. Click on line number to add breakpoint
function calculateTotal(items) {
  let total = 0; // ← Click here to add breakpoint

  for (let item of items) {
    total += item.price; // Will pause here
  }

  return total;
}

// 2. Press F5 to start debugging
// 3. Click on variables to inspect them
// 4. Use F10 to step through line by line
// 5. Press F11 to step into functions
```

---

## 2. 🔍 Research Assistant

### Modes

**1. 🌐 Web Search**

- Search the entire internet for information
- Get multiple results from DuckDuckGo
- See titles, snippets, and source URLs
- Open links directly in browser

**2. 📚 Code Documentation**

- Find official documentation for libraries
- Search React, Node.js, Python docs, etc.
- Get direct links to API references
- Smart doc filtering by library

**3. 💡 Code Examples**

- Find working code samples
- Search GitHub and Stack Overflow
- Get real-world usage patterns
- Language and pattern specific

**4. 🐛 Bug/Error Solutions**

- Search for solutions to errors
- Get Stack Overflow answers
- Find GitHub issues with solutions
- Programming language aware

### Features

**Smart Tabs**

- Switch between different search modes
- Save context when switching tabs
- Quick access to different research types

**Search History**

- Recent searches saved automatically
- Click to repeat previous searches
- Up to 10 most recent searches kept

**Result Cards**

- Source attribution (DuckDuckGo, GitHub, etc.)
- Result type indication
- Full snippet preview
- Copy URL button
- Click to open in browser

**Smart Caching**

- Results cached for faster retrieval
- Memory efficient storage
- Cache statistics available

### Usage Example

```typescript
// Example 1: Search for React hooks documentation
// 1. Click the "📚 Docs" tab
// 2. Type "react hooks"
// 3. Get official React documentation links
// 4. Click to open in browser

// Example 2: Find async/await examples
// 1. Click the "💡 Examples" tab
// 2. Type "typescript async await"
// 3. Get GitHub code examples
// 4. Copy interesting patterns

// Example 3: Fix TypeError
// 1. Click the "🐛 Issues" tab
// 2. Paste error: "Cannot read property 'map' of undefined"
// 3. Get solutions from Stack Overflow
// 4. Learn from similar cases
```

### API Endpoints

```bash
# Web Search
POST http://127.0.0.1:43120/api/research/web-search
{
  "query": "your search query",
  "num_results": 10
}

# Code Documentation
POST http://127.0.0.1:43120/api/research/code-documentation-search
{
  "library": "react",
  "topic": "hooks"
}

# Code Examples
POST http://127.0.0.1:43120/api/research/code-example-search
{
  "language": "typescript",
  "pattern": "async await"
}

# Bug Solutions
POST http://127.0.0.1:43120/api/research/bug-solution-search
{
  "error_message": "TypeError: Cannot read property",
  "language": "javascript"
}
```

---

## 3. 🤖 Enhanced Agent

### Capabilities

The CodIn Agent now supports:

**1. Ask Mode - Interactive Coding**

```
You: "How do I validate email addresses in TypeScript?"
AI:
  - Explains validation concepts
  - Provides regex pattern
  - Shows full working code
  - Explains trade-offs
```

**2. Plan Mode - Architecture Help**

```
You: "Plan a todo app with React, Redux, and Firebase"
AI:
  - Suggests folder structure
  - Recommends component hierarchy
  - Lists required libraries
  - Explains data flow
```

**3. Agent Mode - Autonomous Coding**

```
You: "Create a REST API with express.js"
AI:
  - Generates project structure
  - Creates basic routes
  - Sets up middleware
  - Provides CRUD operations
```

**4. Implement Mode - Convert to Code**

```
You: "Add authentication to the API"
AI:
  - Analyzes existing code
  - Generates implementation
  - Integrates seamlessly
  - Shows what changed
```

**5.🔍 Research-Aware**

```
You: "What's the latest way to do X?"
AI:
  - Searches web for current practices
  - Checks documentation
  - Finds code examples
  - Provides up-to-date answer
```

### Advanced Features

**Multi-turn Conversation**

- Build on previous responses
- Refine generated code
- Ask follow-up questions
- Maintain context across turns

**Context Awareness**

- Reads current file
- Respects selected code
- Understands project structure
- Considers existing patterns

**Multilingual Support**

- Ask in Hindi, Tamil, Telugu, English
- Auto-translates to English for AI
- Translates response back to your language
- Preserves code in original language

**Code Analysis**

- Understands your code patterns
- Suggests improvements
- Spots potential bugs
- Recommends optimizations

### Example Workflows

**Workflow 1: Build Feature with Research**

```
1. Ask: "Show me modern React patterns"
   → Agent searches for latest React patterns
   → Shows code examples

2. Ask: "Create a component using hooks"
   → Uses pattern knowledge from research
   → Generates clean code

3. Ask: "How do I test this?"
   → Finds testing library docs
   → Shows test patterns
   → Writes test code
```

**Workflow 2: Debug with AI Help**

```
1. Open Debug panel
2. Hit breakpoint
3. Right-click variable → "Explain this"
4. Agent explains value and flow
5. Get suggestions for fixes
```

**Workflow 3: API Development**

```
1. Ask: "Create REST API with filtering"
2. Agent generates:
   - Express setup
   - Routes with filters
   - Database queries
   - Error handling

3. Ask: "Add pagination"
   - Modifies existing code
   - Maintains structure
   - Adds helpers
```

---

## 📋 Getting Started

### Enable Debug Panel

1. Open CodIn
2. Click Activity Bar → Debug (🐛)
3. Add breakpoint by clicking line number
4. Press F5 to start debugging

### Open Research Panel

1. Open CodIn
2. Click Activity Bar → Research (🔍)
3. Choose search type (Web/Docs/Examples/Bugs)
4. Enter query and search

### Use Enhanced Agent

1. Press Ctrl+Shift+L for Chat
2. Ask in any language
3. Get researched, up-to-date answers
4. Ask follow-ups to refine results

---

## ⚙️ Configuration

### Debug Settings

```json
{
  "debug.breakPoint.enabled": true,
  "debug.stack.maxFrames": 50,
  "debug.variables.maxDepth": 3,
  "debug.console.maxLines": 1000
}
```

### Research Settings

```json
{
  "research.cache.enabled": true,
  "research.maxResults": 10,
  "research.timeout": 10000,
  "research.cacheSize": 100
}
```

### Agent Settings

```json
{
  "agent.researchEnabled": true,
  "agent.multilingualEnabled": true,
  "agent.contextSize": 4000,
  "agent.temperature": 0.7
}
```

---

## 🔗 Integration with Other Features

### Debug + Research

- Right-click variable → "Research related docs"
- Error in debugger → Auto-research solution
- Unwanted behavior → Search for patterns

### Agent + Debug

- Generate code → Debug immediately
- Hit error → Ask AI while paused
- Found issue → Get AI fix suggestions

### All Together

1. Ask AI to create feature
2. Debug the implementation
3. Use research for best practices
4. Refine with AI suggestions

---

## 🎯 Pro Tips

**1. Conditional Breakpoints**

- Set to break only on specific conditions
- Avoid breaking on every iteration
- Use for targeted debugging

**2. Watch Expressions**

- Watch computed values, not just variables
- Examples: `item.total * 1.1`, `Math.abs(diff)`
- Update in real-time

**3. Smart Research**

- Search by exact error name
- Use library name for docs
- Search "pattern + language"

**4. Agent Context**

- Give agent your existing code
- Select relevant code sections
- Use descriptive prompts
- Ask clarifying questions

---

## 📊 Performance

| Feature        | Performance | Notes             |
| -------------- | ----------- | ----------------- |
| Debugging      | <100ms      | Breakpoint check  |
| Web Search     | 2-5s        | Network dependent |
| Research Cache | <50ms       | Instant results   |
| Agent Response | 2-10s       | API dependent     |

---

## 🐛 Troubleshooting

### Debug not working

- Ensure project supports debugging
- Check breakpoint is on executable line
- Try F5 to start (not continue)

### Research returns no results

- Check internet connection
- Try different search terms
- Try specific library name

### Agent seems slow

- It's thinking/researching (normal)
- Check internet connection
- Check agent service running on port 43120

---

## 🚀 What's Next?

Planned features:

- Remote debugging support
- Live collaboration in debugger
- AI-powered debugging (auto-find bugs)
- Integrated research in editor margins
- One-click documentation inline
- AI pair programming with Debug view

---

## 📞 Support

Need help?

1. Check these docs
2. Ask CodIn Agent (it's always available!)
3. Search web research panel
4. Report issues on GitHub

Happy coding! 🎉
