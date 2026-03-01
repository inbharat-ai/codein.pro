const pino = require("pino");
const { config } = require("../config");

const logger = pino({
  level: config.logLevel,
  base: {
    service: "codin-agent",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

function createRequestLogger(requestId) {
  return logger.child({ requestId });
}

module.exports = {
  logger,
  createRequestLogger,
};
