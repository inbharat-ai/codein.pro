# Changelog

## 0.1.0 - 2026-02-27

### Added

**Architecture**
- Forked from Continue with full rebrand to BharatCode
- Created packages layout: extension, agent, shared
- BharatAgent local HTTP service (port 43120)
- Telemetry OFF by default

**Modes & Edit Contract**
- Ask / Plan / Agent / Implement mode selector
- Tools disabled in Ask/Plan/Implement modes
- Implement mode: strict JSON contract validation with auto-repair
- Preview panel with apply/rollback UI
- Unified diff applier with backup/rollback

**BharatAgent & Models**
- Model store management (download/import/activate GGUF models)
- Smart router (local vs cloud, coder vs reasoner heuristics)
- Model Manager UI panel in config sidebar
- Translation endpoint stubs for multilingual support

**Voice MVP**
- Voice panel with Hindi/Assamese/Tamil speech-to-text
- OS TTS fallback for offline usage
- Translation hooks integrated with BharatAgent

**Run Panel**
- Auto-detect project type (Next.js/Vite/CRA/static HTML)
- Command permission gating with workspace state persistence
- Terminal execution with preview URL detection
- Run/Stop/Preview controls in config sidebar

**Git Actions**
- Git status with branch and file changes
- Commit with message (auto-stage option)
- Push to remote with confirmation
- Checkout/create branch
- All actions require explicit permission confirmation

**Deploy Helpers**
- Generate Vercel/Netlify/Firebase config files
- Platform-specific deployment instructions
- Deploy section in config sidebar

**MCP Integration**
- Protocol stubs for server/tool listing
- MCP panel in config sidebar (ready for future integration)

**Testing & CI**
- 7 unit tests: contract validation, diff apply, router decisions, model store
- GitHub Actions workflow: bharatcode-tests.yml
- Extension package build validation

**Documentation**
- README.md with quickstart and highlights
- ARCHITECTURE.md with package structure
- SECURITY.md with privacy guarantees
- CONTRIBUTING.md with development guidelines
- Final status and blockers reports
