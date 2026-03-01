# CodIn Quick Reference

## Keyboard Shortcuts

| Action              | Windows/Linux   | Mac             |
| ------------------- | --------------- | --------------- |
| Open Chat           | `Ctrl+L`        | `Cmd+L`         |
| Focus Without Clear | `Ctrl+Shift+L`  | `Cmd+Shift+L`   |
| Inline Edit         | `Ctrl+I`        | `Cmd+I`         |
| Exit Edit Mode      | `Escape`        | `Escape`        |
| Open Settings       | Click gear icon | Click gear icon |

## Modes

| Mode      | Purpose                 | Tools       | Output             |
| --------- | ----------------------- | ----------- | ------------------ |
| Ask       | Questions, explanations | ❌ Disabled | Markdown           |
| Plan      | Structured planning     | ❌ Disabled | Markdown           |
| Agent     | Autonomous execution    | ✅ Enabled  | Markdown + Actions |
| Implement | Deterministic edits     | ❌ Disabled | JSON contract      |

## File Locations

```
~/.codin/                     # CodIn Agent data directory
├── models/                        # Downloaded GGUF models
└── model-store.json               # Model configuration

~/.vscode/globalStorage/codin/
└── contract-backups/              # Implement mode backups
    └── {timestamp}/
        ├── backup.json            # Metadata
        └── *.bak                  # File backups
```

## CodIn Agent API

Base URL: `http://localhost:43120`

| Endpoint           | Method | Purpose              |
| ------------------ | ------ | -------------------- |
| `/health`          | GET    | Health check         |
| `/models`          | GET    | List models          |
| `/models/download` | POST   | Download GGUF model  |
| `/models/import`   | POST   | Import local model   |
| `/models/activate` | POST   | Set active model     |
| `/router`          | POST   | Get routing decision |
| `/translate`       | POST   | Translate text       |
| `/voice/stt`       | POST   | Speech-to-text       |
| `/voice/tts`       | POST   | Text-to-speech       |

## Edit Contract Schema

```json
{
  "plan": ["step 1", "step 2"],
  "patches": [
    {
      "path": "relative/file/path.ts",
      "diff": "@@ unified diff format @@"
    }
  ],
  "new_files": [
    {
      "path": "new/file.ts",
      "content": "file contents"
    }
  ],
  "run_instructions": "npm test",
  "explanation_user_language": "Summary in user's language"
}
```

## Common Commands

### Development

```bash
# Install dependencies
npm install
cd gui && npm install

# Build extension
cd packages/extension
npm run esbuild

# Run tests
npm test

# Format code
npm run format

# Launch debug
# Press F5 in VS Code
```

### Testing

```bash
# All tests
npm test

# Specific test
node --test packages/shared/test/contract.test.mjs

# Package extension
cd packages/extension
npm run package
```

## Configuration Locations

| Setting            | Location                    | Format   |
| ------------------ | --------------------------- | -------- |
| VS Code Settings   | `.vscode/settings.json`     | JSON     |
| Workspace State    | `.vscode/`                  | Internal |
| Model Config       | `~/.codin/model-store.json` | JSON     |
| Extension Settings | Settings > CodIn            | UI       |

## Troubleshooting

### Extension won't activate

```
Check: Output > CodIn
Fix: Reload window (Ctrl+Shift+P > Reload Window)
```

### CodIn Agent not starting

```
Check: Output > CodIn Agent
Fix: Ensure port 43120 is available
```

### GUI not loading

```
Check: Developer Tools console
Fix: cd gui && npm run build
```

### Mode selector missing

```
Check: Chat is open (Ctrl+L)
Fix: Reload webview (Ctrl+Shift+P > Reload Webviews)
```

### Voice not working

```
Check: Browser microphone permission
Fix: Use HTTPS or localhost (required for Web Speech API)
```

## Support Channels

- **GitHub Issues**: Bug reports
- **GitHub Discussions**: Questions, feature requests
- **Documentation**: `/docs` folder
- **Email**: (if configured)

## Version Information

Current Version: `0.1.0`
Last Updated: `2026-02-27`

## License

Apache 2.0
