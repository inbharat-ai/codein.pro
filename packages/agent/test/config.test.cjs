const test = require("node:test");
const assert = require("node:assert/strict");

const CONFIG_PATH = "../src/config";

test("loadConfig uses safe defaults", async () => {
  const original = { ...process.env };
  delete process.env.BHARAT_AGENT_PORT;
  delete process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  delete process.env.CODIN_OFFLINE_MODE;

  const { loadConfig } = require(CONFIG_PATH);
  const config = loadConfig({ skipDotenv: true });

  assert.equal(config.port, 43120);
  assert.equal(config.nodeEnv, "development");
  assert.equal(config.offlineMode, false);
  assert.equal(config.trustProxy, false);

  process.env = original;
});

test("loadConfig auto-generates JWT secret when not set", async () => {
  const original = { ...process.env };
  delete process.env.JWT_SECRET;

  const { loadConfig } = require(CONFIG_PATH);
  const config = loadConfig({ skipDotenv: true });
  assert.ok(config.jwtSecret, "jwtSecret must not be empty");
  assert.ok(
    config.jwtSecret.length >= 32,
    "auto-generated secret must be at least 32 chars",
  );

  process.env = original;
});

test("loadConfig rejects invalid port", async () => {
  const original = { ...process.env };
  process.env.BHARAT_AGENT_PORT = "99999";

  const { loadConfig } = require(CONFIG_PATH);
  assert.throws(
    () => loadConfig({ skipDotenv: true }),
    /Invalid BHARAT_AGENT_PORT/,
  );

  process.env = original;
});

test("loadConfig parses TRUST_PROXY", async () => {
  const original = { ...process.env };
  process.env.TRUST_PROXY = "true";

  const { loadConfig } = require(CONFIG_PATH);
  const config = loadConfig({ skipDotenv: true });
  assert.equal(config.trustProxy, true);

  process.env = original;
});
