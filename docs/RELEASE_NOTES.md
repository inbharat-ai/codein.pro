# CodeIn Public Beta — Release Notes (2026-03-01)

## What’s New

- First public beta release of CodeIn AI coding assistant
- GUI build, Electron distributables for Windows/macOS/Linux
- Bundled llama-server for offline-first inference
- All major UX components mounted and accessible

## What’s Fixed

- Dead code quarantine
- ESM/CJS module conversion for reliability
- Electron packaging and resource inclusion
- E2E inference and health checks
- Security gates: JWT, permissions, validation, rate limiting, CORS, headers

## Supported OS Targets

- Windows (CodIn.exe)
- macOS (CodeIn-darwin-x64.dmg)
- Linux (CodeIn-linux-x64.AppImage)

## Offline-First Behavior

- Llama-server runs locally, no cloud required for core inference
- Cloud APIs (OpenAI, Anthropic, Gemini) can be enabled via settings

## How to Enable Optional Cloud APIs

- Go to Settings > Providers
- Enter API keys for OpenAI, Anthropic, or Gemini
- Toggle provider usage as needed
- All cloud requests are opt-in and privacy-respecting
