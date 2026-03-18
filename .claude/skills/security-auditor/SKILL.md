---
name: security-auditor
display_name: Security Auditor
description: OWASP-aligned security audit for Node.js/React/Electron apps covering injection, auth, dependencies, secrets, and API hardening
category: security
version: 1.0.0
author: inbharatai
tags:
  - security
  - owasp
  - audit
  - vulnerabilities
  - node
  - react
---

# Security Auditor

Perform a structured security audit of the codebase. Every finding maps to an OWASP category, includes a severity rating, and provides a concrete remediation.

## When to Use

- Before a release or public deployment
- After adding a new external-facing feature (API endpoint, user input form, file upload)
- When onboarding a new dependency
- Periodic security review (recommended quarterly)
- After a security incident to check for similar patterns

## When NOT to Use

- Reviewing purely cosmetic UI changes
- Auditing third-party code you cannot modify (report upstream instead)
- Performance optimization work (use performance-optimizer skill)

## OWASP Top 10 Checklist (Web Application Focus)

### A01: Broken Access Control

- [ ] Every API endpoint checks authorization (not just authentication)
- [ ] No IDOR — resource access validates ownership (`user.id === resource.ownerId`)
- [ ] CORS is configured restrictively (`Access-Control-Allow-Origin` is NOT `*` in production)
- [ ] Directory listing is disabled on static file servers
- [ ] JWT claims are validated server-side, not trusted blindly
- [ ] Role-based checks use allowlists, not denylists

### A02: Cryptographic Failures

- [ ] Passwords hashed with bcrypt/scrypt/argon2 (NOT MD5, SHA-1, or SHA-256 alone)
- [ ] Secrets stored in environment variables or secret manager, never in source code
- [ ] HTTPS enforced everywhere (HSTS header with `max-age >= 31536000`)
- [ ] Sensitive data encrypted at rest (API keys in SecretStorage, not localStorage)
- [ ] No sensitive data in URLs, logs, or error messages

### A03: Injection

**Node.js specific patterns to scan for:**

```javascript
// DANGEROUS — command injection
child_process.exec(`git clone ${userInput}`);
// SAFE — use execFile with argument array
child_process.execFile("git", ["clone", sanitizedUrl]);

// DANGEROUS — SQL injection
db.query(`SELECT * FROM users WHERE id = '${userId}'`);
// SAFE — parameterized query
db.query("SELECT * FROM users WHERE id = $1", [userId]);

// DANGEROUS — path traversal
fs.readFile(path.join("/uploads", userFilename));
// SAFE — resolve and verify prefix
const resolved = path.resolve("/uploads", userFilename);
if (!resolved.startsWith("/uploads/")) throw new Error("Path traversal");

// DANGEROUS — eval injection
eval(userExpression);
new Function("return " + userExpression)();
// SAFE — use a sandboxed evaluator or allowlisted operations
```

**React specific:**

- `dangerouslySetInnerHTML` with unsanitized input = XSS
- `href={userInput}` can execute `javascript:` URIs — validate protocol
- Sanitize with DOMPurify before rendering any HTML from external sources

### A04: Insecure Design

- [ ] Rate limiting on authentication endpoints (login, register, password reset)
- [ ] Account lockout after repeated failures
- [ ] CSRF tokens on state-changing operations (or SameSite=Strict cookies)
- [ ] Input validation happens server-side, not just client-side

### A05: Security Misconfiguration

- [ ] Debug mode disabled in production (`NODE_ENV=production`)
- [ ] Default credentials changed
- [ ] Error messages do not expose stack traces to users
- [ ] Unnecessary HTTP methods disabled
- [ ] Security headers set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`

### A06: Vulnerable Components

```bash
# Run dependency audit
npm audit
# Check for known CVEs
npx audit-ci --critical

# Review: are there abandoned dependencies?
# Check last publish date, open issues count, maintainer activity
```

- [ ] No dependencies with known critical/high CVEs
- [ ] Lockfile is committed and reviewed for unexpected changes
- [ ] No dependencies pulled from unverified registries

### A07: Authentication Failures

- [ ] JWT tokens have short expiry (15min for access, 7d for refresh)
- [ ] Refresh tokens are rotated on use (one-time use)
- [ ] JWT algorithm is explicitly set (`{ algorithms: ['HS256'] }`) — prevents algorithm confusion attacks
- [ ] Password requirements enforced (minimum 8 chars, no common passwords)
- [ ] Session invalidation on password change

### A08: Data Integrity Failures

- [ ] CI/CD pipeline does not execute untrusted code
- [ ] Dependencies installed with lockfile (`npm ci`, not `npm install`)
- [ ] Auto-update mechanisms verify signatures

### A09: Logging & Monitoring Failures

- [ ] Authentication successes and failures are logged
- [ ] Authorization failures are logged
- [ ] Input validation failures are logged (potential probing)
- [ ] Logs do NOT contain passwords, tokens, PII, or credit card numbers
- [ ] Logs include correlation IDs for request tracing

### A10: SSRF

- [ ] Server-side HTTP requests validate destination (no internal IPs, no metadata endpoints)
- [ ] URL parsing uses strict validation (no protocol tricks, no redirects to internal networks)

## Node.js Specific Threats

### Prototype Pollution

```javascript
// DANGEROUS
Object.assign(target, userInput);
_.merge(target, userInput);
// SAFE — freeze prototype or use Map
Object.assign(Object.create(null), userInput);
```

### ReDoS (Regular Expression Denial of Service)

- Avoid nested quantifiers: `(a+)+`, `(a|b)*c`
- Test regexes against ReDoS scanners before deploying
- Set timeouts on regex execution for user-provided patterns

### Environment Variable Security

- [ ] `.env` files are in `.gitignore`
- [ ] Secrets are loaded from env vars, not hardcoded
- [ ] Production secrets differ from development
- [ ] Secret rotation process is documented

## API Security Headers Checklist

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## Output Format

For each finding:

```
[SEVERITY: CRITICAL|HIGH|MEDIUM|LOW] OWASP-A0X — Title
  Location: file/path.ts:line
  Issue: Description of the vulnerability
  Impact: What an attacker could achieve
  Remediation: Specific code change or configuration fix
```

End with a summary table of findings by OWASP category and overall risk assessment.
