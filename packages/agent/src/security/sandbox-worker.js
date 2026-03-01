const { parentPort } = require("worker_threads");

parentPort.on("message", async (message) => {
  const { id, code, context, timeout } = message;

  try {
    const func = new Function(...Object.keys(context), code);
    const result = await func(...Object.values(context));

    parentPort.postMessage({
      id,
      success: true,
      result,
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
