---
name: test-architect
display_name: Test Architect
description: Testing strategy and patterns for Vitest/Jest with React Testing Library — pyramid structure, mock strategies, and anti-patterns to avoid
category: testing
version: 1.0.0
author: inbharatai
tags:
  - testing
  - vitest
  - jest
  - react-testing-library
  - tdd
  - mocking
---

# Test Architect

Design and write effective tests that catch real bugs, run fast, and don't break when implementation details change.

## When to Use

- Writing tests for new features or components
- Reviewing test quality and coverage
- Setting up testing infrastructure for a new module
- Debugging flaky or slow tests
- Deciding what and how to test

## When NOT to Use

- Writing end-to-end tests that involve browser automation (use Playwright/Cypress guidance instead)
- Testing third-party library internals
- When the code under test needs refactoring first (refactor, then test)

## Testing Pyramid

```
        /  E2E  \          — Few (5-10%), slow, high confidence
       / Integration \      — Moderate (20-30%), medium speed
      /    Unit Tests   \   — Many (60-70%), fast, focused
```

- **Unit tests**: Single function or hook in isolation. Fast, deterministic.
- **Integration tests**: Component with its hooks, context, and child components. May involve Redux store or API mocks.
- **E2E tests**: Full user flows through the running application.

**Coverage targets:**

- 80% line coverage overall
- 100% on critical paths (auth, payments, data mutation, permission checks)
- Branch coverage matters more than line coverage for conditionals

## Test Naming Convention

```
describe('AgentExecutor', () => {
  it('should retry failed tool calls up to 3 times', () => { ... });
  it('should emit circuit-breaker event when retry limit exceeded', () => { ... });
  it('should not retry on permission denial errors', () => { ... });
});
```

Format: `should [expected behavior] when [condition/context]`

Never: `test1`, `it works`, `handles error`. Names must describe the contract being tested.

## React Testing Library Patterns

### The Core Pattern: Render, Find, Assert

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('should display error message when form submitted empty', async () => {
  const user = userEvent.setup();
  render(<LoginForm onSubmit={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: /sign in/i }));

  expect(screen.getByRole('alert')).toHaveTextContent(/email is required/i);
});
```

### Query Priority (use in this order)

1. **`getByRole`** — best for accessibility, matches what screen readers see
2. **`getByLabelText`** — for form fields
3. **`getByPlaceholderText`** — when label is not available
4. **`getByText`** — for non-interactive elements
5. **`getByTestId`** — last resort, when nothing semantic works

### getBy vs queryBy vs findBy

| Method    | Throws if not found | Async       | Use case                              |
| --------- | ------------------- | ----------- | ------------------------------------- |
| `getBy`   | Yes                 | No          | Element should exist right now        |
| `queryBy` | No (returns null)   | No          | Assert element does NOT exist         |
| `findBy`  | Yes                 | Yes (waits) | Element appears after async operation |

```typescript
// Assert something is NOT rendered
expect(screen.queryByRole("alert")).not.toBeInTheDocument();

// Wait for async content
const result = await screen.findByText(/success/i);
```

### userEvent over fireEvent

Always use `userEvent` — it simulates real user behavior (focus, keyboard events, pointer events). `fireEvent` only dispatches a single DOM event.

```typescript
const user = userEvent.setup();

// Good: simulates real typing (focus, keydown, input, keyup for each char)
await user.type(screen.getByRole("textbox"), "hello");

// Bad: just dispatches a change event
fireEvent.change(input, { target: { value: "hello" } });
```

## Mock Strategies

### When to Mock

- External services (APIs, databases) — always mock in unit tests
- Time-dependent code (`Date.now`, `setTimeout`) — mock for determinism
- Expensive operations (crypto, file I/O) — mock for speed

### When NOT to Mock

- The module under test itself
- Simple utility functions (just use the real implementation)
- React child components (let them render naturally)

### MSW for API Mocking (Recommended)

```typescript
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const server = setupServer(
  http.get("/api/agents", () => {
    return HttpResponse.json([{ id: "1", name: "Coder", status: "active" }]);
  }),
  http.post("/api/agents", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: "2", ...body }, { status: 201 });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

MSW intercepts at the network level — your code makes real fetch calls, so you test the full request/response cycle.

### vi.mock / jest.mock (Use Sparingly)

```typescript
// Mock a specific module
vi.mock("@/services/analytics", () => ({
  track: vi.fn(),
}));

// Mock only one export, keep the rest real
vi.mock("@/utils/config", async () => {
  const actual = await vi.importActual("@/utils/config");
  return { ...actual, getFeatureFlag: vi.fn(() => true) };
});
```

### Dependency Injection (Best for Testability)

Design functions to accept dependencies as parameters:

```typescript
// Testable: inject the dependency
function createAgent(name: string, repository: AgentRepository) { ... }

// In test: pass a fake
const fakeRepo = { save: vi.fn(), findById: vi.fn() };
createAgent('test', fakeRepo);
```

## Snapshot Testing Anti-Patterns

**Avoid large component snapshots.** They break on every unrelated change and nobody reads the diff.

**Acceptable snapshot use:**

- Small, stable data structures (API response shapes, config objects)
- Error message strings

**Never snapshot:**

- Full component render output
- Large HTML trees
- Anything that changes frequently

## What NOT to Test

- **Implementation details**: Don't test state values directly; test what the user sees.
- **Third-party libraries**: Don't test that React renders or that Express routes correctly.
- **Trivial code**: Simple getters, type definitions, constants.
- **CSS classes**: Don't assert `className` — assert visible behavior.

## Test Organization

```
src/
  components/
    AgentCard/
      AgentCard.tsx
      AgentCard.test.tsx      ← colocated test
  hooks/
    useAgentStatus.ts
    useAgentStatus.test.ts
  services/
    agentService.ts
    __tests__/
      agentService.test.ts    ← __tests__ dir for service layer
```

Colocate tests with source files. Use `__tests__` directories only when many test files would clutter the source directory.
