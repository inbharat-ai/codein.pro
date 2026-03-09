/**
 * Apocalypse Hardening Tests
 * Tests for all hardening changes from the Distributed Systems Apocalypse pass:
 * - Concurrency limiter (queue cap + backpressure)
 * - Idempotency cache (LRU + TTL)
 * - Rate limiter LRU cap
 * - State machine mutex (async transitions)
 * - Swarm task pruning
 * - Event stream subscriber cap
 * - Circuit breaker half-open safety
 */
"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

// ══════════════════════════════════════════════════════════════
// 1. CONCURRENCY LIMITER
// ══════════════════════════════════════════════════════════════

const {
  IdempotencyCache,
  ConcurrencyLimiter,
} = require("../src/utils/concurrency");

describe("ConcurrencyLimiter", () => {
  test("allows up to maxConcurrent simultaneous operations", async () => {
    const limiter = new ConcurrencyLimiter(3);
    const log = [];

    const task = (id, ms) =>
      limiter.run(
        () =>
          new Promise((resolve) => {
            log.push(`start:${id}`);
            setTimeout(() => {
              log.push(`end:${id}`);
              resolve(id);
            }, ms);
          }),
      );

    const results = await Promise.all([
      task("a", 30),
      task("b", 30),
      task("c", 30),
    ]);
    assert.deepEqual(results, ["a", "b", "c"]);
    assert.equal(log.filter((l) => l.startsWith("start:")).length, 3);
  });

  test("queues requests beyond maxConcurrent", async () => {
    const limiter = new ConcurrencyLimiter(1);
    let running = 0;
    let maxRunning = 0;

    const task = () =>
      limiter.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
      });

    await Promise.all([task(), task(), task()]);
    assert.equal(maxRunning, 1);
  });

  test("rejects when queue exceeds maxQueue", async () => {
    const limiter = new ConcurrencyLimiter(1, 1); // 1 concurrent, 1 queued max
    const holds = [];

    // Fill the concurrent slot
    const blocker = limiter.run(
      () =>
        new Promise((resolve) => {
          holds.push(resolve);
        }),
    );
    // Fill the queue
    const queued = limiter.run(() => Promise.resolve("queued"));

    assert.equal(limiter.activeCount, 1);
    assert.equal(limiter.queueLength, 1);

    // Third should be rejected
    await assert.rejects(() => limiter.run(() => Promise.resolve("rejected")), {
      statusCode: 503,
    });

    // Cleanup
    holds[0]();
    await blocker;
    await queued;
  });

  test("activeCount and queueLength reflect state", async () => {
    const limiter = new ConcurrencyLimiter(2);
    assert.equal(limiter.activeCount, 0);
    assert.equal(limiter.queueLength, 0);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. IDEMPOTENCY CACHE
// ══════════════════════════════════════════════════════════════

describe("IdempotencyCache", () => {
  test("returns miss for unknown key", () => {
    const cache = new IdempotencyCache({ maxEntries: 100, ttlMs: 60000 });
    const result = cache.get("unknown");
    assert.equal(result.hit, false);
  });

  test("stores and retrieves cached response", () => {
    const cache = new IdempotencyCache({ maxEntries: 100, ttlMs: 60000 });
    cache.set("key1", 200, '{"ok":true}');

    const result = cache.get("key1");
    assert.equal(result.hit, true);
    assert.equal(result.status, 200);
    assert.equal(result.body, '{"ok":true}');
  });

  test("evicts oldest when at capacity", () => {
    const cache = new IdempotencyCache({ maxEntries: 2, ttlMs: 60000 });
    cache.set("a", 200, "a");
    cache.set("b", 200, "b");
    cache.set("c", 200, "c"); // should evict "a"

    assert.equal(cache.get("a").hit, false);
    assert.equal(cache.get("b").hit, true);
    assert.equal(cache.get("c").hit, true);
  });

  test("expires entries after TTL", async () => {
    const cache = new IdempotencyCache({ maxEntries: 100, ttlMs: 50 });
    cache.set("key1", 200, "body");

    // Should be cached immediately
    assert.equal(cache.get("key1").hit, true);

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 80));
    cache._evict();
    assert.equal(cache.get("key1").hit, false);
  });

  test("destroy clears cache", () => {
    const cache = new IdempotencyCache({ maxEntries: 100, ttlMs: 60000 });
    cache.set("k", 200, "v");
    cache.destroy();
    assert.equal(cache.get("k").hit, false);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. RATE LIMITER LRU CAP
// ══════════════════════════════════════════════════════════════

const { RateLimiter } = require("../src/middleware/rate-limiter");

describe("RateLimiter LRU", () => {
  test("evicts oldest bucket when at maxBuckets capacity", () => {
    const rl = new RateLimiter({
      maxBuckets: 3,
      requestsPerMinute: 100,
      requestsPerHour: 1000,
    });

    rl.getBucket("ip1");
    rl.getBucket("ip2");
    rl.getBucket("ip3");
    assert.equal(rl.buckets.size, 3);

    // Adding a 4th should evict the first
    rl.getBucket("ip4");
    assert.equal(rl.buckets.size, 3);
    assert.equal(rl.buckets.has("ip1"), false);
    assert.equal(rl.buckets.has("ip4"), true);
  });

  test("accessing a bucket moves it to end (LRU)", () => {
    const rl = new RateLimiter({
      maxBuckets: 3,
      requestsPerMinute: 100,
      requestsPerHour: 1000,
    });

    rl.getBucket("ip1");
    rl.getBucket("ip2");
    rl.getBucket("ip3");

    // Access ip1 (moves it to end)
    rl.getBucket("ip1");

    // Now add ip4 — should evict ip2 (oldest after ip1 was refreshed)
    rl.getBucket("ip4");
    assert.equal(rl.buckets.has("ip1"), true);
    assert.equal(rl.buckets.has("ip2"), false);
  });

  test("destroy clears interval and buckets", () => {
    const rl = new RateLimiter({ maxBuckets: 3 });
    rl.getBucket("test");
    rl.destroy();
    assert.equal(rl.buckets.size, 0);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. STATE MACHINE MUTEX
// ══════════════════════════════════════════════════════════════

const { ComputeStateMachine } = require("../src/compute/state-machine");
const { createJob, JOB_STATUSES } = require("../src/compute/job-model");

describe("StateMachine Mutex", () => {
  test("concurrent transitions on same job are serialized", async () => {
    const sm = new ComputeStateMachine();
    const job = createJob({ goal: "Mutex test" });

    // Start two transitions at the same time
    const t1 = sm.transitionJob(job, JOB_STATUSES.PLANNING);
    // t2 should wait for t1 and then attempt PLANNING → RUNNING
    const t2 = sm.transitionJob(job, JOB_STATUSES.RUNNING);

    await Promise.all([t1, t2]);
    assert.equal(job.status, JOB_STATUSES.RUNNING);
  });

  test("different jobs can transition concurrently", async () => {
    const sm = new ComputeStateMachine();
    const job1 = createJob({ goal: "Job 1" });
    const job2 = createJob({ goal: "Job 2" });

    const [r1, r2] = await Promise.all([
      sm.transitionJob(job1, JOB_STATUSES.PLANNING),
      sm.transitionJob(job2, JOB_STATUSES.PLANNING),
    ]);

    assert.equal(job1.status, JOB_STATUSES.PLANNING);
    assert.equal(job2.status, JOB_STATUSES.PLANNING);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. SWARM TASK PRUNING
// ══════════════════════════════════════════════════════════════

const { SwarmManager } = require("../src/mas/swarm-manager");

describe("SwarmManager Task Pruning", () => {
  test("_pruneCompletedTasks removes old completed tasks", () => {
    const sw = new SwarmManager({ runLLM: async () => "{}" });

    // Simulate tasks in the map
    sw._tasks.set("task-1", {
      id: "task-1",
      status: "completed",
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    });
    sw._tasks.set("task-2", {
      id: "task-2",
      status: "completed",
      completedAt: new Date().toISOString(), // just now
    });
    sw._tasks.set("task-3", {
      id: "task-3",
      status: "running",
      completedAt: null,
    });

    const pruned = sw._pruneCompletedTasks(60 * 60 * 1000); // 1 hour max age
    assert.equal(pruned, 1); // only task-1 pruned
    assert.equal(sw._tasks.size, 2);
    assert.equal(sw._tasks.has("task-1"), false);
    assert.equal(sw._tasks.has("task-2"), true);
    assert.equal(sw._tasks.has("task-3"), true);

    // Cleanup interval
    clearInterval(sw._taskPruneInterval);
  });

  test("_pruneCompletedTasks keeps tasks within TTL", () => {
    const sw = new SwarmManager({ runLLM: async () => "{}" });

    sw._tasks.set("recent", {
      id: "recent",
      status: "partial",
      completedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
    });

    const pruned = sw._pruneCompletedTasks(60 * 60 * 1000);
    assert.equal(pruned, 0);
    assert.equal(sw._tasks.has("recent"), true);

    clearInterval(sw._taskPruneInterval);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. EVENT STREAM SUBSCRIBER CAP
// ══════════════════════════════════════════════════════════════

const { ComputeEventStream } = require("../src/compute/event-stream");

describe("EventStream Subscriber Cap", () => {
  test("rejects connections when at global subscriber cap", () => {
    const stream = new ComputeEventStream();
    stream._maxGlobalSubscribers = 2;

    // Simulate 2 subscribers
    stream._stats.activeConnections = 2;

    // Create mock response with all needed methods
    let written = null;
    let statusCode = null;
    const mockRes = {
      writeHead(code) {
        statusCode = code;
      },
      write() {},
      end(body) {
        written = body;
      },
      on() {},
    };
    const mockReq = { headers: {} };

    stream.subscribe("job1", mockRes, mockReq);
    assert.equal(statusCode, 503);
    assert.ok(written.includes("Too many"));
  });
});

// ══════════════════════════════════════════════════════════════
// 7. CIRCUIT BREAKER HALF-OPEN SAFETY
// ══════════════════════════════════════════════════════════════

const {
  ExternalProviderManager,
} = require("../src/model-runtime/external-providers");

describe("CircuitBreaker HalfOpen Safety", () => {
  test("resets stuck half-open probe after safety timeout", () => {
    const mgr = new ExternalProviderManager();
    const providerId = "openai";
    mgr.configure(providerId, { apiKey: "test-key", model: "gpt-4" });

    // Simulate circuit breaker in half-open with stuck probe
    const cb = mgr.providerHealth.get(providerId);
    cb.state = "half_open";
    cb.halfOpenInFlight = true;
    cb._halfOpenStartedAt = Date.now() - 120000; // 2 minutes ago (well past safety timeout)

    // The safety check should reset halfOpenInFlight
    const callable = mgr._isProviderCallable(providerId);
    // After safety timeout, halfOpenInFlight should have been reset
    assert.equal(cb.halfOpenInFlight, true); // Re-set to true because it's now the new probe
    assert.ok(callable.callable); // Should be callable again
  });
});
