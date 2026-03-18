---
name: code-reviewer
display_name: Code Reviewer
description: Comprehensive code review covering security, performance, error handling, naming, DRY, testing, and accessibility for React/TypeScript/Node.js codebases
category: quality
version: 1.0.0
author: inbharatai
tags:
  - code-review
  - security
  - performance
  - best-practices
  - quality
---

# Code Reviewer

Perform thorough, structured code reviews on diffs, files, or entire modules. Every finding must include a severity rating, file:line reference, and a concrete fix suggestion.

## When to Use

- Reviewing a PR diff or staged changes before commit
- Auditing a module or file for quality issues
- Pre-merge quality gate checks
- Onboarding review of unfamiliar code

## When NOT to Use

- Trivial formatting-only changes (defer to linters)
- Auto-generated code (protobuf stubs, lock files, migrations)
- When the user just wants a quick opinion — use conversational review instead

## Review Checklist

### 1. Security Vulnerabilities (Critical/High)

Scan for these patterns — any match is at least HIGH severity:

- **Injection**: `eval()`, `new Function()`, `child_process.exec()` with unsanitized input, SQL string concatenation, `dangerouslySetInnerHTML` with user data
- **XSS**: Rendering user input without escaping in JSX (`{userInput}` is safe, but watch for `innerHTML`, `document.write`, `srcdoc`)
- **CSRF**: State-mutating endpoints without CSRF tokens; missing `SameSite` cookie attributes
- **Path Traversal**: `path.join(base, userInput)` without `path.resolve` + prefix check; `fs.readFile` with user-controlled paths
- **Prototype Pollution**: `Object.assign({}, userInput)` or lodash `_.merge` with untrusted objects
- **Secrets in Code**: API keys, tokens, passwords in source files or committed `.env` files
- **Insecure Dependencies**: Known CVEs in dependencies; `npm audit` findings

### 2. Performance Issues (Medium/High)

- **React Re-renders**: Missing `React.memo` on expensive pure components; new object/array literals in JSX props (`style={{}}`, `options={[]}`); anonymous functions in render creating new refs every cycle
- **N+1 Patterns**: Fetching related data inside a `.map()` or loop instead of batching; sequential awaits that could be `Promise.all`
- **Memory Leaks**: Missing cleanup in `useEffect` (intervals, subscriptions, event listeners); storing growing arrays in refs or module-level variables; detached DOM nodes held by closures
- **Bundle Size**: Importing entire libraries (`import _ from 'lodash'` vs `import debounce from 'lodash/debounce'`); missing dynamic imports for heavy components
- **Unnecessary Work**: Computing derived state in render instead of `useMemo`; redundant API calls on every render

### 3. Error Handling (Medium)

- Bare `catch(e) {}` swallowing errors silently
- Missing error boundaries around suspense-capable components
- Async functions without `.catch()` or try/catch
- HTTP calls without timeout configuration
- Missing validation on external data (API responses, file reads, env vars)

### 4. Naming and Readability (Low/Medium)

- Ambiguous names: `data`, `info`, `result`, `temp`, `handler` without context
- Boolean variables not prefixed with `is`/`has`/`should`/`can`
- Inconsistent naming: mixing `camelCase` and `snake_case` in the same file
- Magic numbers/strings without named constants
- Functions longer than 50 lines without extraction
- Deeply nested conditionals (>3 levels) — suggest early returns or guard clauses

### 5. DRY Violations (Medium)

- Copy-pasted logic across components (extract to shared hook or utility)
- Repeated API call patterns (extract to service layer)
- Duplicated validation schemas (centralize in a shared schemas file)
- Similar component structures that differ only in props (extract base component)

### 6. Test Coverage Gaps (Medium)

- New public functions/components without corresponding tests
- Modified branching logic without updated test cases
- Edge cases not covered: empty arrays, null/undefined, boundary values, error states
- Mocking overuse — testing implementation details instead of behavior

### 7. Accessibility (Medium)

- Interactive elements without ARIA labels (`<div onClick>` needs `role="button"` + `tabIndex` + `onKeyDown`)
- Images without `alt` text
- Form inputs without associated `<label>` elements
- Color as the sole differentiator (needs icon or text too)
- Missing focus management after modals/dialogs open

## Severity Ratings

| Severity     | Meaning                                                                          | Action                                 |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------- |
| **Critical** | Security vulnerability, data loss risk, crash in production                      | Must fix before merge                  |
| **High**     | Significant bug, performance regression, missing error handling on critical path | Should fix before merge                |
| **Medium**   | Code smell, maintainability concern, minor bug in edge case                      | Fix in this PR or file follow-up issue |
| **Low**      | Style nit, naming suggestion, documentation gap                                  | Optional, author's discretion          |

## Output Format

For each finding, produce:

```
[SEVERITY] file/path.tsx:42 — Brief title
  Problem: What is wrong and why it matters.
  Suggestion: Concrete code change or approach.
```

Group findings by severity (Critical first, Low last). End with a summary: total findings by severity, overall assessment (approve / request changes / comment only), and any positive callouts for well-written code.
