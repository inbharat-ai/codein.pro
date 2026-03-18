---
name: react-component
display_name: React Component Builder
description: React component design patterns — composition, hooks, TypeScript props, accessibility, styling with Tailwind, and performance-conscious architecture
category: frontend
version: 1.0.0
author: inbharatai
tags:
  - react
  - components
  - hooks
  - typescript
  - accessibility
  - tailwind
---

# React Component Builder

Design and build React components that are composable, type-safe, accessible, and performant. Follow these patterns for every component.

## When to Use

- Building a new UI component from scratch
- Refactoring an existing component for better composition
- Reviewing component architecture decisions
- Adding accessibility to existing components
- Designing a component API (props interface)

## When NOT to Use

- Server-side rendering concerns (use Next.js/Remix patterns instead)
- State management architecture (use Redux/Zustand skill)
- API integration patterns (use api-designer skill)

## Component Design Principles

### Composition Over Inheritance

Never use class inheritance for component reuse. Use composition:

```typescript
// BAD: inheritance thinking
function PrimaryButton(props) { return <Button variant="primary" {...props} />; }
function DangerButton(props) { return <Button variant="danger" {...props} />; }
// This creates N wrapper components for N variants

// GOOD: composition via props
<Button variant="primary">Save</Button>
<Button variant="danger">Delete</Button>
```

### Compound Components

For components with multiple related parts that share implicit state:

```typescript
// Usage — parent controls coordination, children handle rendering
<Tabs defaultValue="code">
  <Tabs.List>
    <Tabs.Trigger value="code">Code</Tabs.Trigger>
    <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="code"><CodeEditor /></Tabs.Content>
  <Tabs.Content value="preview"><Preview /></Tabs.Content>
</Tabs>
```

Implement with React Context for shared state between parent and children. Each sub-component is attached as a static property on the parent.

### Controlled vs Uncontrolled

**Controlled**: Parent owns the state, component receives value + onChange.
**Uncontrolled**: Component owns its own state, parent reads via ref or callback.

**Rule of thumb**: If multiple components need to react to the same state, use controlled. If the state is purely internal UI state (e.g., whether a dropdown is open), uncontrolled is fine.

Support both with a pattern like:

```typescript
interface InputProps {
  value?: string;           // controlled
  defaultValue?: string;    // uncontrolled
  onChange?: (value: string) => void;
}

function Input({ value, defaultValue, onChange }: InputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternalValue(e.target.value);
    onChange?.(e.target.value);
  };

  return <input value={currentValue} onChange={handleChange} />;
}
```

## TypeScript Props Design

### Required vs Optional

```typescript
interface AgentCardProps {
  // Required — component cannot render without these
  agent: Agent;
  onSelect: (agentId: string) => void;

  // Optional — sensible defaults exist
  showStatus?: boolean; // default: true
  className?: string; // for style composition
  size?: "sm" | "md" | "lg"; // default: 'md'
}
```

### Discriminated Unions for Variants

When a component has mutually exclusive modes:

```typescript
type NotificationProps =
  | { variant: "success"; message: string; onDismiss?: () => void }
  | { variant: "error"; message: string; error: Error; onRetry: () => void }
  | { variant: "loading"; message?: string };

function Notification(props: NotificationProps) {
  switch (props.variant) {
    case "success": // props.onDismiss available
    case "error": // props.error and props.onRetry available
    case "loading": // minimal props
  }
}
```

This ensures TypeScript enforces that `onRetry` is only passed with `variant: 'error'`.

### Polymorphic `as` Prop

For components that can render as different HTML elements:

```typescript
type ButtonProps<T extends React.ElementType = 'button'> = {
  as?: T;
  children: React.ReactNode;
} & React.ComponentPropsWithoutRef<T>;

function Button<T extends React.ElementType = 'button'>({
  as,
  children,
  ...rest
}: ButtonProps<T>) {
  const Component = as || 'button';
  return <Component {...rest}>{children}</Component>;
}

// Usage
<Button>Click me</Button>                    // renders <button>
<Button as="a" href="/docs">Docs</Button>    // renders <a>, href is typed
```

## Custom Hook Patterns

### Extract When

- Stateful logic is reused across 2+ components
- A component's hook section exceeds ~20 lines
- Logic involves multiple related useState/useEffect calls

### Naming and Return Types

```typescript
// Name: use<Purpose>
// Return: object for 3+ values, tuple for simple pair
function useAgentStatus(agentId: string) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    /* ... */
  }, [agentId]);

  // Return object — named properties, easy to destructure partially
  return { status, error, isLoading, refresh };
}

// Usage
const { status, refresh } = useAgentStatus(agent.id);
```

### useReducer for Complex State

When state transitions involve multiple related values:

```typescript
type ChatState = {
  messages: Message[];
  isTyping: boolean;
  error: string | null;
};

type ChatAction =
  | { type: "SEND_MESSAGE"; payload: Message }
  | { type: "RECEIVE_RESPONSE"; payload: Message }
  | { type: "SET_ERROR"; payload: string }
  | { type: "CLEAR" };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SEND_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.payload],
        isTyping: true,
        error: null,
      };
    case "RECEIVE_RESPONSE":
      return {
        ...state,
        messages: [...state.messages, action.payload],
        isTyping: false,
      };
    case "SET_ERROR":
      return { ...state, isTyping: false, error: action.payload };
    case "CLEAR":
      return { messages: [], isTyping: false, error: null };
  }
}
```

## Styling with Tailwind

### Utility-First Approach

```typescript
// Component with Tailwind classes
function Badge({ variant, children }: BadgeProps) {
  const variantStyles = {
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]}`}>
      {children}
    </span>
  );
}
```

### CSS Variables for Theming

Define in `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      surface: 'var(--color-surface)',
      'surface-hover': 'var(--color-surface-hover)',
      'text-primary': 'var(--color-text-primary)',
    },
  },
}
```

### Responsive Design (Mobile-First)

```html
<!-- Mobile first: base styles, then add for larger screens -->
<div className="flex flex-col gap-2 md:flex-row md:gap-4 lg:gap-6">
  <aside className="w-full md:w-64 lg:w-80">Sidebar</aside>
  <main className="flex-1">Content</main>
</div>
```

## Accessibility Checklist

### Every Interactive Element Needs

- [ ] **Keyboard accessible**: Can be focused with Tab and activated with Enter/Space
- [ ] **Visible focus indicator**: `focus-visible:ring-2 focus-visible:ring-blue-500`
- [ ] **Accessible name**: via text content, `aria-label`, or `aria-labelledby`
- [ ] **Role**: Correct ARIA role if not using semantic HTML

### Common Patterns

```typescript
// Custom button using div — needs role, tabIndex, keyDown handler
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
  aria-label="Close panel"
>
  <XIcon />
</div>

// Better: just use a <button>
<button onClick={handleClick} aria-label="Close panel">
  <XIcon />
</button>
```

### Focus Management

After opening a modal, move focus to the first focusable element inside it. After closing, return focus to the trigger element. Use `useRef` to track the trigger.

### Screen Reader Testing

Test with VoiceOver (Mac), NVDA (Windows), or axe-core automated checks. Ensure:

- All images have meaningful `alt` text (or `alt=""` for decorative)
- Form errors are announced via `aria-live="polite"` regions
- Page landmarks exist (`<main>`, `<nav>`, `<aside>`)

## Performance Considerations

- Use `React.lazy` + `Suspense` for components not in the initial viewport
- Wrap expensive child trees in `React.memo` with stable props
- Use `key` prop correctly — unique and stable identifiers, never array index for reorderable lists
- Avoid creating components inside render functions (they unmount/remount every render)

```typescript
// BAD: component defined inside render — remounts every time
function Parent() {
  const Child = () => <div>I remount every render</div>;
  return <Child />;
}

// GOOD: component defined outside
const Child = () => <div>I persist correctly</div>;
function Parent() {
  return <Child />;
}
```
