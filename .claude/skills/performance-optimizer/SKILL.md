---
name: performance-optimizer
display_name: Performance Optimizer
description: Performance optimization for React, Node.js, and Electron apps — rendering, bundle size, event loop, database queries, and Lighthouse metrics
category: performance
version: 1.0.0
author: inbharatai
tags:
  - performance
  - optimization
  - react
  - node
  - bundle-size
  - lighthouse
---

# Performance Optimizer

Identify and fix performance bottlenecks with measurable impact. Every optimization must be justified with before/after metrics or profiling data.

## When to Use

- Application feels slow (UI lag, slow API responses, long startup)
- Bundle size has grown significantly
- Lighthouse scores have dropped below targets
- Memory usage is increasing over time
- CPU profiling shows hot functions

## When NOT to Use

- Premature optimization — if there is no measured performance problem, do not optimize
- Micro-optimizations that save nanoseconds (prefer readability)
- When the bottleneck is network latency to a third-party service (optimize the architecture, not the code)

## React Performance

### When to Actually Use useMemo and useCallback

**useMemo — use when:**

- Computing derived data from large arrays (sorting, filtering, grouping 1000+ items)
- Creating objects/arrays passed as props to `React.memo` components
- Expensive calculations (regex parsing, tree traversal, serialization)

**useMemo — do NOT use when:**

- Simple property access or string concatenation
- Creating small objects that are cheap to recreate
- The value is not passed to any memoized child component

**useCallback — use when:**

- Passing a callback to a `React.memo` child component
- The callback is a dependency of another hook's dependency array
- Stable reference is needed for event listener cleanup

**useCallback — do NOT use when:**

- The callback is passed to native DOM elements (React handles this)
- No child component is memoized
- The function is defined and used in the same component with no child dependency

### React.memo

Wrap components in `React.memo` when:

- They receive the same props frequently but parent re-renders often
- They render expensive subtrees (charts, editors, large lists)
- Profiling shows them as a re-render hotspot

```typescript
const AgentCard = React.memo(function AgentCard({ agent, onSelect }: Props) {
  // Only re-renders when agent or onSelect changes
  return <div onClick={() => onSelect(agent.id)}>{agent.name}</div>;
});
```

### Virtualization for Long Lists

If rendering 100+ items in a list, use virtualization:

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

function TaskList({ tasks }: { tasks: Task[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // estimated row height
  });
  // Only renders visible rows + overscan buffer
}
```

### Code Splitting

Split heavy components that are not on the critical render path:

```typescript
const MonacoEditor = React.lazy(() => import('./MonacoEditor'));
const TerminalPanel = React.lazy(() => import('./TerminalPanel'));

function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      {showEditor && <MonacoEditor />}
      {showTerminal && <TerminalPanel />}
    </Suspense>
  );
}
```

### Avoid These Re-render Triggers

```typescript
// BAD: new object every render → children re-render
<List style={{ marginTop: 10 }} />
// GOOD: stable reference
const listStyle = useMemo(() => ({ marginTop: 10 }), []);

// BAD: new function every render
<Button onClick={() => handleClick(id)} />
// GOOD: stable callback (only if Button is React.memo)
const handleClick = useCallback(() => onClick(id), [id, onClick]);

// BAD: new array every render
<Select options={items.filter(i => i.active)} />
// GOOD: memoize derived data
const activeItems = useMemo(() => items.filter(i => i.active), [items]);
```

## Node.js Performance

### Event Loop Profiling

The event loop must stay responsive. If a single tick takes >100ms, the server is blocked.

**Detect blocking:**

```javascript
const start = process.hrtime.bigint();
setImmediate(() => {
  const delay = Number(process.hrtime.bigint() - start) / 1e6;
  if (delay > 100) logger.warn(`Event loop blocked for ${delay}ms`);
});
```

**Common blockers and fixes:**
| Blocker | Fix |
|---------|-----|
| `JSON.parse` on huge payloads (>10MB) | Stream-parse with `jsonstream2` or move to worker thread |
| Synchronous `fs` operations | Replace with async: `fs.promises.readFile` |
| CPU-intensive computation (crypto, compression) | Offload to `worker_threads` |
| Large `Array.sort` or `Array.filter` on 100K+ items | Process in chunks or use streaming |
| Complex regex on large strings | Use `re2` library or set timeout |

### Worker Threads for CPU Work

```javascript
import { Worker, isMainThread, parentPort } from "worker_threads";

if (isMainThread) {
  const worker = new Worker(__filename, { workerData: { input } });
  worker.on("message", (result) => {
    /* handle result */
  });
  worker.on("error", (err) => {
    /* handle error */
  });
} else {
  const result = expensiveComputation(workerData.input);
  parentPort.postMessage(result);
}
```

### Stream Processing

Never load entire files into memory. Use streams:

```javascript
// BAD: loads entire file into memory
const content = await fs.promises.readFile("huge.log", "utf8");
const lines = content.split("\n").filter((l) => l.includes("ERROR"));

// GOOD: stream processing, constant memory
const rl = readline.createInterface({ input: fs.createReadStream("huge.log") });
for await (const line of rl) {
  if (line.includes("ERROR")) results.push(line);
}
```

### Connection Pooling

Database and HTTP connections should be pooled:

- PostgreSQL: `pg` pool with `max: 20`, `idleTimeoutMillis: 30000`
- HTTP: Use `http.Agent` with `keepAlive: true`, `maxSockets: 50`

## Build Optimization

### Bundle Analysis

```bash
# Vite
npx vite-bundle-visualizer

# Webpack
npx webpack-bundle-analyzer stats.json
```

Look for:

- Dependencies imported but not used (tree-shake or remove)
- Duplicate packages (different versions of same lib)
- Large libraries with smaller alternatives (moment.js -> dayjs, lodash -> lodash-es per-function imports)

### Tree Shaking Checklist

- [ ] Use ES module imports (`import { x } from 'lib'`), not CommonJS (`require`)
- [ ] Package.json has `"sideEffects": false` (or lists actual side-effect files)
- [ ] No barrel files that re-export everything (`index.ts` that does `export * from './a'; export * from './b'`)

## Lighthouse Targets

| Metric                         | Target  | What It Measures                         |
| ------------------------------ | ------- | ---------------------------------------- |
| LCP (Largest Contentful Paint) | < 2.5s  | When main content is visible             |
| FID (First Input Delay)        | < 100ms | Responsiveness to first user interaction |
| CLS (Cumulative Layout Shift)  | < 0.1   | Visual stability (no jumping elements)   |
| TTFB (Time to First Byte)      | < 800ms | Server response time                     |
| TBT (Total Blocking Time)      | < 200ms | Main thread blocking during load         |

## Measurement First

Never optimize without measuring. Use:

- **React DevTools Profiler** — identify which components re-render and how long they take
- **Chrome Performance tab** — flame chart for main thread work
- **Node.js `--prof`** — V8 CPU profile for server-side hotspots
- **`process.memoryUsage()`** — track RSS and heap growth over time
- **`performance.mark()` / `performance.measure()`** — custom timing for specific operations
