"use strict";
const { parentPort } = require("worker_threads");

parentPort.on("message", async (message) => {
  const { id, code, context } = message;

  try {
    const keys = Object.keys(context);
    const values = Object.values(context);
    const func = new Function(...keys, code);
    const result = await func(...values);

    parentPort.postMessage({
      id,
      success: true,
      result: result === undefined ? null : result,
      error: null,
    });
  } catch (error) {
    parentPort.postMessage({
      id,
      success: false,
      result: null,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
  }
});
