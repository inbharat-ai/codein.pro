# BLOCKERS

**Status: CLEARED ✅**

All previously identified blockers have been resolved:

- ✅ Run panel: permission gating, localhost preview detection, and terminal execution fully implemented
- ✅ Git actions: status/commit/push/checkout with confirmation flows complete
- ✅ Test coverage: 7 unit tests passing (contract validation, diff apply, router, model store)
- ✅ CI workflow: bharatcode-tests.yml added with unit tests + extension package build

## Known Limitations

- MCP integration is stubbed (shows empty list)
- Voice recognition uses browser API (offline quality varies)
- Local model integration requires manual GGUF file download
- Deploy helpers generate config files only (manual deployment steps required)
