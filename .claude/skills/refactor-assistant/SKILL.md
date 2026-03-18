---
name: refactor-assistant
display_name: Refactor Assistant
description: Safe, incremental refactoring with code smell detection, proven patterns, and test-first workflow for React/TypeScript/Node.js
category: refactoring
version: 1.0.0
author: inbharatai
tags:
  - refactoring
  - code-smells
  - clean-code
  - react
  - typescript
---

# Refactor Assistant

Guide and execute safe refactoring operations. Every refactoring follows the rule: tests first, small steps, verify after each change.

## When to Use

- A file or function has grown too large and needs decomposition
- Duplicated logic needs extraction into shared utilities
- A component's responsibilities need to be separated
- Code smells have been identified that hurt maintainability
- Preparing code for a new feature by improving its structure first

## When NOT to Use

- The code works, is readable, and no feature work is planned for it (leave it alone)
- You need to ship a hotfix — refactoring can wait for the next cycle
- There are no tests and adding them first is not feasible (too risky to refactor blind)

## Safe Refactoring Workflow

**Always follow this order:**

1. **Ensure test coverage** — Run existing tests. If the code under refactoring lacks tests, write characterization tests that capture current behavior before changing anything.
2. **Make one small change** — Apply exactly one refactoring operation. Not two, not three. One.
3. **Run tests** — All tests must pass. If any fail, revert and investigate.
4. **Commit** — Each refactoring step gets its own commit with a descriptive message.
5. **Repeat** — Go back to step 2 for the next refactoring.

## Code Smell Detection

### File-Level Smells

| Smell                     | Threshold                     | Action                                   |
| ------------------------- | ----------------------------- | ---------------------------------------- |
| **Long File**             | >400 lines                    | Split into focused modules               |
| **God Module**            | Handles 3+ unrelated concerns | Extract into separate modules by concern |
| **Circular Dependencies** | Module A imports B imports A  | Introduce an interface/shared module     |

### Function-Level Smells

| Smell                   | Threshold                      | Action                                                                |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------- |
| **Long Method**         | >50 lines                      | Extract Method — pull cohesive blocks into named functions            |
| **Too Many Parameters** | >4 params                      | Introduce Parameter Object — group related params into a typed object |
| **Deep Nesting**        | >3 levels of indentation       | Use early returns, guard clauses, or extract helper functions         |
| **Flag Arguments**      | Boolean param changes behavior | Split into two functions or use strategy pattern                      |

### Class/Component-Level Smells

| Smell                   | Signal                                              | Action                                         |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------- |
| **Feature Envy**        | Method uses another module's data more than its own | Move method to the module it envies            |
| **Shotgun Surgery**     | Changing one behavior requires edits in 5+ files    | Consolidate related logic into a single module |
| **Data Clumps**         | Same 3+ variables always appear together            | Extract into a named type/interface            |
| **Primitive Obsession** | Using `string` for emails, IDs, URLs                | Create branded types or value objects          |

## Refactoring Patterns

### Extract Method

Pull a block of code into a named function. The new function name should describe WHAT it does, not HOW.

```typescript
// Before
function processOrder(order: Order) {
  // validate
  if (!order.items.length) throw new Error("Empty order");
  if (order.items.some((i) => i.quantity <= 0))
    throw new Error("Invalid quantity");
  // ... 40 more lines
}

// After
function processOrder(order: Order) {
  validateOrder(order);
  // ... rest stays focused on processing
}

function validateOrder(order: Order): void {
  if (!order.items.length) throw new Error("Empty order");
  if (order.items.some((i) => i.quantity <= 0))
    throw new Error("Invalid quantity");
}
```

### Extract React Component

When a component renders distinct UI sections, extract them. Pass only the data they need.

### Extract Custom Hook

When stateful logic is reused or a component's hook section exceeds ~20 lines, extract to a custom hook. Name it `use<Purpose>`. Return a typed object, not a tuple (unless it's a simple pair like `[value, setValue]`).

### Replace Conditional with Polymorphism

When a `switch` or `if/else` chain selects behavior by type, replace with a strategy map.

```typescript
// Before
function getIcon(type: string) {
  if (type === 'error') return <ErrorIcon />;
  if (type === 'warning') return <WarningIcon />;
  if (type === 'info') return <InfoIcon />;
  return <DefaultIcon />;
}

// After
const ICON_MAP: Record<string, React.ComponentType> = {
  error: ErrorIcon,
  warning: WarningIcon,
  info: InfoIcon,
};

function getIcon(type: string) {
  const Icon = ICON_MAP[type] ?? DefaultIcon;
  return <Icon />;
}
```

### Introduce Parameter Object

When a function takes many related parameters, group them.

### Move to Shared Module

When two modules contain the same utility function, extract it to a shared location. Update all call sites in the same commit.

## React-Specific Refactoring

- **Render prop to hook**: If a component uses render props solely for logic sharing, convert to a custom hook. Hooks compose better and avoid wrapper hell.
- **HOC to hook**: Higher-order components add indirection and complicate types. Migrate to hooks where possible.
- **Class component to function**: Convert `componentDidMount` to `useEffect(() => {}, [])`, `componentDidUpdate` to `useEffect` with deps, `componentWillUnmount` to cleanup return in `useEffect`.
- **Redux slice decomposition**: If a Redux slice handles multiple unrelated state domains (e.g., UI state + data cache), split it into focused slices.
- **Component decomposition**: A component over 200 lines likely handles too many concerns. Look for natural split points: header/body/footer, form sections, conditional render branches.

## Verification Checklist

After completing a refactoring:

- [ ] All existing tests pass
- [ ] No new TypeScript errors (`tsc --noEmit`)
- [ ] No new lint warnings
- [ ] Bundle size has not increased (for component extractions)
- [ ] The refactored code is genuinely easier to understand (not just "different")
- [ ] All call sites have been updated (search for old function/component names)
