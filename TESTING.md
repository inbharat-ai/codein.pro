# CodIn Testing Guide

## Unit Tests

Run all unit tests:

```bash
npm test
```

This runs:

- `packages/shared/test/*.test.mjs` - Contract validation and diff tests
- `packages/agent/test/*.test.cjs` - Router and model store tests

### Test Coverage

1. **Contract Validation** (`packages/shared/test/contract.test.mjs`)

   - Valid payload acceptance
   - JSON repair (extract from wrapped text)

2. **Diff Apply** (`packages/shared/test/diff.test.mjs`)

   - Simple hunk application
   - Trailing newline preservation

3. **Router Decisions** (`packages/agent/test/router.test.cjs`)

   - Cloud fallback when no local model
   - Reasoner selection for deep planning

4. **Model Store** (`packages/agent/test/store.test.cjs`)
   - Model persistence and reload
   - Directory creation

## Manual Testing

### Mode Selector

1. Open VS Code with CodIn installed
2. Focus the chat input (Ctrl+L)
3. Verify mode selector shows Ask/Plan/Agent/Implement
4. Switch to Implement mode
5. Send a prompt requesting code changes
6. Verify JSON contract validation and preview panel

### CodIn Agent

1. Check CodIn Agent auto-starts (logs in Output > CodIn)
2. Open Settings (gear icon) > Models
3. Verify Model Manager shows empty state
4. (Optional) Import a GGUF model via the UI

### Voice Panel

1. Focus chat input
2. Click microphone icon below input
3. Select Hindi/Assamese/Tamil
4. Verify browser prompts for microphone permission
5. Speak a query and verify transcription appears

### Run Panel

1. Open Settings > Run
2. Verify auto-detected project type and command
3. Click "Run" and verify permission prompt
4. Accept permission and verify terminal opens
5. If port detected, click "Open Preview"

### Git Actions

1. Open Settings > Git
2. Verify current branch and changes shown
3. Enter commit message and click "Commit"
4. Verify permission prompt and commit success
5. Click "Push" and verify remote push

### Deploy Helpers

1. Open Settings > Deploy
2. Click Vercel/Netlify/Firebase
3. Verify config file creation and instructions

## Extension Package Test

Build and package extension:

```bash
cd packages/extension
npm install
npm run esbuild
npm run package
```

Verify `codin-*.vsix` is created without errors.

## CI Tests

GitHub Actions workflow (`.github/workflows/codin-tests.yml`) runs:

1. Node 20 setup
2. Unit test execution
3. Extension package build

Check workflow status in Actions tab after pushing.

## Known Test Gaps

- No E2E tests for webview <-> extension protocol
- No integration tests for CodIn Agent HTTP endpoints
- Manual testing required for permission gates
- Voice recognition quality varies by browser/OS
