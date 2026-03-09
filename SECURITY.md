# Security Policy

## Supported Versions

| Version | Supported |
| :------ | :-------- |
| 1.x     | ✅        |
| < 1.0   | ❌        |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue.**
2. Email: **security@codein.pro**
3. Or use [GitHub Security Advisories](https://github.com/inbharat-ai/codein.pro/security/advisories/new)

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Security Architecture

### Key Handling

- API keys are stored in VS Code SecretStorage (encrypted at rest)
- Agent runtime receives only temporary session tokens
- Keys are never logged, never transmitted to telemetry

### Permissions

- Tool execution requires explicit user confirmation
- Git actions and deploy commands require confirmation
- Run commands are gated by per-workspace allow lists
- Destructive operations (delete, force-push) are permission-gated

### Telemetry

- Telemetry is **OFF by default**
- Zero tracking, zero analytics in the default configuration
- When opted in, only anonymized events are sent

### Network

- Agent runtime binds to `127.0.0.1` only — not exposed to network
- No outbound connections unless user configures external AI providers
- Rate limiting applied to all API endpoints

### Code Execution

- Sandbox isolation for compute pipeline jobs
- Circuit breaker on LLM/tool execution paths
- Timeout and retry protection on critical loops
- Audit logging for all permission-gated operations
