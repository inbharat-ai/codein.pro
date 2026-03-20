# Security Policy

## Supported Versions

| Version    | Supported          |
| ---------- | ------------------ |
| 1.0.3-beta | :white_check_mark: |
| 1.0.2-beta | :x:                |
| 1.0.1-beta | :x:                |
| 1.0.0-beta | :x:                |
| < 1.0.0    | :x:                |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **info@inbharat.ai**

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Security Measures

CodeIn implements multiple security layers:

- **Fail-closed permission system** — all agent actions require explicit approval by default
- **JWT authentication** — all API endpoints authenticated with short-lived tokens
- **Injection detection** — prompt injection and command injection scanning
- **Audit logging** — complete trail of all agent actions and tool executions
- **Sandboxed execution** — Docker-based sandbox for untrusted code execution
- **Circuit breakers** — automatic provider isolation on repeated failures
- **Rate limiting** — per-endpoint rate limits to prevent abuse
- **Input validation** — Joi schema validation on all API inputs

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

## Responsible Disclosure

We follow a 90-day responsible disclosure policy. We ask that you:

1. Allow us reasonable time to fix the issue before public disclosure
2. Make a good-faith effort to avoid privacy violations, data destruction, or service disruption
3. Do not access or modify other users' data

Thank you for helping keep CodeIn and its users safe.
