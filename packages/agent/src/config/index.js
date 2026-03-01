const path = require("node:path");
const dotenv = require("dotenv");

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "")
    return defaultValue;
  return String(value).toLowerCase() === "true";
}

function parsePort(value, defaultValue) {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid BHARAT_AGENT_PORT: ${value}`);
  }
  return parsed;
}

function parseInteger(
  value,
  defaultValue,
  min = 0,
  max = Infinity,
  name = "value",
) {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Invalid ${name}: ${value} (must be integer between ${min} and ${max})`,
    );
  }
  return parsed;
}

function loadConfig(options = {}) {
  const { skipDotenv = false, envPath = path.join(process.cwd(), ".env") } =
    options;

  if (!skipDotenv) {
    dotenv.config({ path: envPath });
  }

  const nodeEnv = process.env.NODE_ENV || "development";
  const config = {
    port: parsePort(process.env.BHARAT_AGENT_PORT, 43120),
    nodeEnv,
    logLevel: process.env.LOG_LEVEL || "info",
    jwtSecret:
      process.env.JWT_SECRET ||
      require("crypto").randomBytes(32).toString("hex"),
    offlineMode: parseBoolean(process.env.CODIN_OFFLINE_MODE, false),

    // Rate limiting
    rateLimitPerMinute: parseInteger(
      process.env.RATE_LIMIT_PER_MINUTE,
      60,
      1,
      10000,
      "RATE_LIMIT_PER_MINUTE",
    ),
    rateLimitPerHour: parseInteger(
      process.env.RATE_LIMIT_PER_HOUR,
      1000,
      1,
      100000,
      "RATE_LIMIT_PER_HOUR",
    ),

    // Security headers
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:*",
    corsCredentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
    cspPolicy:
      process.env.CSP_POLICY ||
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    enableHsts: parseBoolean(process.env.ENABLE_HSTS, true),
    hstsMaxAge: parseInteger(
      process.env.HSTS_MAX_AGE,
      31536000,
      0,
      63072000,
      "HSTS_MAX_AGE",
    ),
  };

  if (config.nodeEnv === "production" && !config.jwtSecret) {
    throw new Error("JWT_SECRET is required when NODE_ENV=production");
  }

  return config;
}

const config = loadConfig();

module.exports = {
  config,
  loadConfig,
};
