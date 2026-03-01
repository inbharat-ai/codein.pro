# CodeIn Compute — User Guide

## Prerequisites

- CodeIn agent server running on port 43120
- At least one local GGUF model downloaded (or external API keys configured)
- Node.js 18+

## Submit a Job

```bash
curl -X POST http://127.0.0.1:43120/compute/jobs \
  -H "Content-Type: application/json" \
  -d '{"goal": "Fix the failing tests in src/utils"}'
```

Response:

```json
{
  "job": {
    "id": "job_a1b2c3d4e5f6...",
    "status": "queued",
    "goal": "Fix the failing tests in src/utils",
    "steps": [],
    "artifacts": []
  }
}
```

The job progresses through states: `queued` → `planning` → `running` → `completed` (or `failed`/`cancelled`).

## Policy

Every job runs under a permission policy. Defaults are **fail-closed** — network, browser, repo write, and external AI escalation are all OFF.

Override per-job:

```bash
curl -X POST http://127.0.0.1:43120/compute/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Research React Server Components and draft an implementation",
    "policy": {
      "allowNetwork": true,
      "allowEscalation": true,
      "maxSteps": 12,
      "maxCostUSD": 0.50
    }
  }'
```

| Field             | Default  | Description                                             |
| ----------------- | -------- | ------------------------------------------------------- |
| `allowNetwork`    | `false`  | Allow HTTP requests to external domains                 |
| `allowBrowser`    | `false`  | Allow browser automation                                |
| `allowFSWrite`    | `true`   | Write files inside the job sandbox                      |
| `allowRepoWrite`  | `false`  | Write to the user's actual repository                   |
| `allowEscalation` | `false`  | Delegate to external AI APIs (OpenAI, Anthropic, etc.)  |
| `allowedDomains`  | `[]`     | Whitelist for network access (e.g., `["*.github.com"]`) |
| `maxSteps`        | `20`     | Maximum execution steps (hard cap: 100)                 |
| `maxDurationMs`   | `600000` | Time limit in ms (hard cap: 1 hour)                     |
| `maxCostUSD`      | `1.00`   | External API budget cap (hard cap: $100)                |

## Demo Workflows

Three pre-built workflows ship out of the box:

```bash
# Fix build failures
curl -X POST http://127.0.0.1:43120/compute/workflows/fix-build

# Generate a feature spec + implementation plan
curl -X POST http://127.0.0.1:43120/compute/workflows/feature-spec

# Web research → synthesise → code (enables network)
curl -X POST http://127.0.0.1:43120/compute/workflows/research-code
```

Override the default goal:

```bash
curl -X POST http://127.0.0.1:43120/compute/workflows/research-code \
  -H "Content-Type: application/json" \
  -d '{"goal": "Research WebSocket authentication patterns in Node.js"}'
```

## Monitor Progress

### SSE (real-time)

```bash
curl -N http://127.0.0.1:43120/compute/jobs/JOB_ID/events
```

Events: `job.progress`, `plan.ready`, `job.step`, `job.artifact`, `job.complete`, `job.error`, `job.paused`, `job.cancelled`.

### Polling

```bash
curl http://127.0.0.1:43120/compute/jobs/JOB_ID
```

## Job Control

```bash
# Pause
curl -X POST http://127.0.0.1:43120/compute/jobs/JOB_ID/pause

# Resume
curl -X POST http://127.0.0.1:43120/compute/jobs/JOB_ID/resume

# Cancel
curl -X POST http://127.0.0.1:43120/compute/jobs/JOB_ID/cancel
```

## Artifacts

Jobs produce artifacts (diffs, reports, code files) stored in the sandbox workspace.

```bash
# List
curl http://127.0.0.1:43120/compute/jobs/JOB_ID/artifacts

# Read
curl http://127.0.0.1:43120/compute/jobs/JOB_ID/artifacts/ARTIFACT_ID
```

## Multilingual

Submit goals in any of the 19 supported languages. The system auto-detects the language, translates to English for processing, and translates outputs back.

```bash
curl -X POST http://127.0.0.1:43120/compute/jobs \
  -H "Content-Type: application/json" \
  -d '{"goal": "src/utils में सभी failing tests को ठीक करो"}'
```

Supported: English, Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, Punjabi, Odia, Assamese, Maithili, Urdu, Sanskrit, Santali, Nepali, Bodo, Dogri.

## GUI

Navigate to the **Compute** tab in the CodeIn sidebar panel. The UI provides:

- Goal input with `Ctrl+Enter` to submit
- Policy toggles (Network, External AI, Write Files)
- Live plan timeline with step status indicators
- Artifact viewer
- Pause / Resume / Cancel controls
- Job history with status dots
- Demo workflow quick-launch cards

## Stats

```bash
curl http://127.0.0.1:43120/compute/stats
```

Returns total/active/completed/failed job counts and aggregate token/cost metrics.
