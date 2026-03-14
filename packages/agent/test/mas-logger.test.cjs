/**
 * MAS — Logger Smoke Tests
 */
const assert = require("node:assert/strict");

const { createLogger, setLogLevel, LOG_LEVEL } = require("../src/mas/logger");

test("createLogger returns object with all log methods", () => {
  const log = createLogger("TestComponent");
  assert.equal(typeof log.debug, "function");
  assert.equal(typeof log.info, "function");
  assert.equal(typeof log.warn, "function");
  assert.equal(typeof log.error, "function");
  assert.equal(typeof log.fatal, "function");
  assert.equal(typeof log.child, "function");
});

test("LOG_LEVEL has correct numeric values", () => {
  assert.equal(LOG_LEVEL.DEBUG, 0);
  assert.equal(LOG_LEVEL.INFO, 1);
  assert.equal(LOG_LEVEL.WARN, 2);
  assert.equal(LOG_LEVEL.ERROR, 3);
  assert.equal(LOG_LEVEL.FATAL, 4);
});

test("setLogLevel accepts valid level names", () => {
  // Should not throw
  setLogLevel("DEBUG");
  setLogLevel("INFO");
  setLogLevel("WARN");
  setLogLevel("ERROR");
  setLogLevel("FATAL");
  // Reset
  setLogLevel("INFO");
});

test("setLogLevel rejects invalid level names", () => {
  assert.throws(() => setLogLevel("TRACE"), /Invalid log level/);
  assert.throws(() => setLogLevel(""), /Invalid log level/);
});

test("child logger returns a logger with all methods", () => {
  const log = createLogger("Parent");
  const child = log.child({ requestId: "abc" });
  assert.equal(typeof child.debug, "function");
  assert.equal(typeof child.info, "function");
  assert.equal(typeof child.warn, "function");
  assert.equal(typeof child.error, "function");
  assert.equal(typeof child.fatal, "function");
});

test("log methods do not throw with context", () => {
  // Temporarily set to FATAL to suppress output during test
  setLogLevel("FATAL");
  const log = createLogger("SilentTest");
  assert.doesNotThrow(() => log.debug("msg", { key: "val" }));
  assert.doesNotThrow(() => log.info("msg"));
  assert.doesNotThrow(() => log.warn("msg", { n: 42 }));
  // Reset
  setLogLevel("INFO");
});
