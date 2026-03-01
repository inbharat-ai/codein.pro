# compute-local

Local-only compute client and event bridge.

## Usage

```js
const { ComputeLocalClient } = require("compute-local");

const client = new ComputeLocalClient();
const { job } = await client.submitJob({ goal: "Summarize src/index.js" });

const subscription = client.subscribeToJobEvents(job.id, (event) => {
  console.log(event.event, event.data);
});

// Later
subscription.close();
```
