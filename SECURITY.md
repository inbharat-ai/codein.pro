# Security

## Key Handling

- API keys are stored in VS Code SecretStorage.
- BharatAgent receives only temporary session tokens when possible.
- Keys are never logged.

## Permissions

- Tool execution requires explicit confirmation.
- Git actions and deploy commands require confirmation.
- Run commands are gated by per-workspace allow lists.

## Telemetry

Telemetry is OFF by default. When enabled, only anonymized events are sent.
