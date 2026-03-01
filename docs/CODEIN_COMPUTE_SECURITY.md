# CodeIn Compute — Security Model

## Fail-Closed by Default

Every compute job starts with all dangerous permissions OFF. The policy fields `allowNetwork`, `allowBrowser`, `allowRepoWrite`, and `allowEscalation` are all `false` unless the user explicitly opts in per-job.

If a permission isn't granted, the operation is denied. There is no implicit allow.

## Sandbox Isolation

Each job gets an isolated workspace at `~/.codin/compute/<jobId>/`. All file operations (read, write, list, delete) are confined to this directory.

**Path traversal prevention**: Every path is resolved against the workspace root. Paths containing `..` are rejected outright. The resolved absolute path must start with the workspace prefix.

**Sealed state**: After a job completes (success or failure), the sandbox is sealed — no further file operations are permitted.

## Tool Gating

The `PolicyEnforcer` checks every tool call before execution:

1. **Blocked tools** — `blockedTools` array always overrides. If a tool is listed here, it's denied regardless of `allowedTools`.
2. **Allowlist** — if `allowedTools` doesn't include the tool name (or `"*"` wildcard), it's denied.
3. **Category gates** — network tools (`searchWeb`, `fetchUrlContent`) require `allowNetwork: true`. Write tools (`createNewFile`, `editFile`) require `allowFSWrite: true`. Browser tools require `allowBrowser: true`.

## Command Execution

The sandbox uses `child_process.spawn()` with `shell: false`. This prevents shell injection.

**Blocked commands**: `rm`, `curl`, `wget`, `bash`, `powershell`, `ssh`, `nc`, `chmod`, `chown`, and 20+ others are denied by name.

**Argument validation**: All args must be an array of strings. Shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `(`, `)`) in non-flag arguments are rejected.

**Environment scrubbing**: Sensitive environment variables (`JWT_SECRET`, `API_KEY`, `AWS_SECRET_ACCESS_KEY`, etc.) are removed before spawning child processes.

**Limits**: 30-second timeout per process. 1 MB stdout/stderr cap.

## Escalation Control

External AI APIs (OpenAI, Anthropic, Gemini) are only called when:

- `allowEscalation: true` in the job policy
- Current cost hasn't exceeded `maxCostUSD`
- Local model confidence is below threshold (< 0.4 always, < 0.6 after retries)

**Context redaction**: Before sending context to external APIs, the `EscalationManager` strips:

- Bearer tokens / Authorization headers
- API keys (pattern: `[A-Za-z0-9_-]{20,}`)
- AWS secret access keys
- Connection strings
- JWT tokens
- Private keys (PEM blocks)

## Resource Limits

| Limit                 | Default | Hard Cap |
| --------------------- | ------- | -------- |
| Max steps per job     | 20      | 100      |
| Max duration          | 10 min  | 1 hour   |
| Max external API cost | $1.00   | $100.00  |
| Process timeout       | 30s     | —        |
| Process output cap    | 1 MB    | —        |

## Audit Trail

The `PolicyEnforcer` maintains an audit log of every permission check (allowed and denied) with timestamps, subjects, and reasons. Accessible via `policyEnforcer.getAuditLog(limit)`.

Job logs also record every state transition, step execution, and error with timestamps.

## Network Isolation

When `allowNetwork: false` (default):

- All network-dependent tools are blocked
- `spawn()` doesn't inherit proxy environment variables
- No HTTP requests leave the machine

When `allowNetwork: true`:

- Optional `allowedDomains` whitelist (supports wildcards: `*.github.com`)
- Empty `allowedDomains` means all domains allowed
- Domain checks happen before the request is made
