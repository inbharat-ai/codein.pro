# BharatCode Architecture

BharatCode is split into three top-level packages:

- `packages/extension`: VS Code extension UI, commands, and IDE wiring
- `packages/agent`: BharatAgent local runtime service (HTTP on 127.0.0.1)
- `packages/shared`: Shared schemas and edit-contract validation

## Extension <-> Agent

The extension auto-starts BharatAgent on activation. The webview UI communicates with the extension through the webview protocol. The extension communicates with BharatAgent over HTTP.

## Edit Contract Safety

Implement and Agent modes use a strict JSON edit contract. The UI validates JSON, shows a preview, and sends the contract to the extension for applying patches. The extension creates a backup before applying diffs and supports rollback.

## Voice + Multilingual

The Voice panel uses browser speech recognition and OS TTS as offline fallbacks. Translation hooks call BharatAgent's `/translate` endpoint when available.
