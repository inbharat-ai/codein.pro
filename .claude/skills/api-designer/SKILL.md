---
name: api-designer
display_name: API Designer
description: REST API design best practices covering resource modeling, error handling, pagination, versioning, validation, and OpenAPI documentation
category: architecture
version: 1.0.0
author: inbharatai
tags:
  - api
  - rest
  - design
  - openapi
  - validation
---

# API Designer

Design and review REST APIs that are consistent, predictable, and developer-friendly. Every endpoint should follow the conventions in this guide.

## When to Use

- Designing new API endpoints or a new service
- Reviewing existing API routes for consistency
- Adding pagination, filtering, or error handling to an API
- Writing OpenAPI/Swagger documentation
- Planning API versioning strategy

## When NOT to Use

- GraphQL API design (different paradigms apply)
- WebSocket or real-time protocol design
- Internal function/module interface design (not HTTP APIs)

## Resource Naming

**Use plural nouns for collections, not verbs:**

```
GET    /api/agents          — List agents
POST   /api/agents          — Create agent
GET    /api/agents/:id      — Get one agent
PATCH  /api/agents/:id      — Partial update
PUT    /api/agents/:id      — Full replace
DELETE /api/agents/:id      — Delete agent
```

**Nested resources for clear ownership:**

```
GET    /api/agents/:agentId/tasks        — List tasks for an agent
POST   /api/agents/:agentId/tasks        — Create task under agent
```

**Conventions:**

- Use kebab-case for multi-word resources: `/api/tool-executions`
- Avoid deep nesting (max 2 levels): `/agents/:id/tasks` is fine, `/agents/:id/tasks/:tid/logs/:lid` is too deep — flatten to `/task-logs/:lid`
- Use query params for filtering, not path segments: `/agents?status=active`, not `/agents/active`

## HTTP Methods and Status Codes

| Method | Purpose          | Success Code               | Idempotent |
| ------ | ---------------- | -------------------------- | ---------- |
| GET    | Read resource(s) | 200                        | Yes        |
| POST   | Create resource  | 201 (with Location header) | No         |
| PUT    | Full replace     | 200 or 204                 | Yes        |
| PATCH  | Partial update   | 200                        | No\*       |
| DELETE | Remove resource  | 204                        | Yes        |

Common error codes:

- **400** — Validation error (bad input from client)
- **401** — Not authenticated (missing or invalid token)
- **403** — Authenticated but not authorized for this resource
- **404** — Resource not found
- **409** — Conflict (duplicate key, concurrent modification)
- **422** — Semantically invalid (well-formed but logically wrong)
- **429** — Rate limit exceeded
- **500** — Server error (never expose stack traces)

## Error Response Format (RFC 7807)

All errors should use a consistent structure:

```json
{
  "type": "https://api.codein.pro/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "The 'temperature' field must be between 0 and 2.",
  "instance": "/api/agents/abc123/config",
  "errors": [
    {
      "field": "temperature",
      "message": "Must be between 0 and 2",
      "value": 5.0
    }
  ]
}
```

Never return plain strings or inconsistent error shapes. Clients should be able to parse errors programmatically.

## Pagination

**Cursor-based (preferred for real-time data):**

```
GET /api/tasks?limit=20&cursor=eyJpZCI6MTAwfQ
```

Response:

```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTIwfQ",
    "has_more": true
  }
}
```

**Offset-based (simpler, acceptable for small datasets):**

```
GET /api/tasks?limit=20&offset=40
```

Response includes `total_count` for UI page numbers.

**When to use which:**

- Cursor: large datasets, real-time data, data that changes frequently
- Offset: small datasets, admin panels, data that rarely changes

## Filtering and Sorting

```
GET /api/tasks?status=active&agent_id=abc&sort=-created_at&fields=id,summary,status
```

- Filter by exact match: `?status=active`
- Filter by range: `?created_after=2026-01-01&created_before=2026-03-01`
- Sort with `-` prefix for descending: `?sort=-created_at,name`
- Sparse fields to reduce payload: `?fields=id,name,status`

## Input Validation (Joi/Zod)

Validate ALL input at the route handler level, before any business logic:

```typescript
// Joi example
const createAgentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  model: Joi.string().valid("gpt-4", "claude-3", "llama-3").required(),
  temperature: Joi.number().min(0).max(2).default(0.7),
  tools: Joi.array().items(Joi.string()).max(20).default([]),
});

// In route handler
const { error, value } = createAgentSchema.validate(req.body, {
  abortEarly: false,
});
if (error) {
  return res.status(400).json({
    type: "validation-error",
    title: "Validation Failed",
    status: 400,
    errors: error.details.map((d) => ({
      field: d.path.join("."),
      message: d.message,
    })),
  });
}
```

## Versioning

**URL path versioning (recommended for simplicity):**

```
/api/v1/agents
/api/v2/agents
```

Rules:

- Never break existing versions — only add new fields, never remove or rename
- Deprecate old versions with `Sunset` header and a migration guide
- New major version only when removing fields or changing response shapes

## Rate Limiting

Include rate limit info in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1679616000
Retry-After: 30
```

Recommended defaults:

- Public endpoints: 60 req/min
- Authenticated endpoints: 300 req/min
- Write endpoints: 30 req/min

## Idempotency

For POST endpoints that create resources, support idempotency keys:

```
POST /api/tasks
Idempotency-Key: unique-client-generated-uuid
```

Server stores the response keyed by idempotency key. If the same key is sent again, return the stored response without re-executing.

## Authentication

**Bearer token in Authorization header (not query params, not cookies for APIs):**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

API keys for server-to-server: `X-API-Key` header. Never in URL query strings (they appear in logs).

## Response Envelope

Wrap all responses consistently:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2026-03-18T10:00:00Z"
  }
}
```

For collections:

```json
{
  "data": [...],
  "pagination": { "next_cursor": "...", "has_more": true },
  "meta": { "total_count": 142, "request_id": "req_abc123" }
}
```
