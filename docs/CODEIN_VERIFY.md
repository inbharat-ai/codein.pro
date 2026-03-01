# CodeIn Verification Runbook

## Agent Verification

```powershell
cd "C:\Users\reetu\Desktop\Bharta Code\packages\agent"
npm test
```

Expected: all tests pass.

## Agent Runtime Health

```powershell
cd "C:\Users\reetu\Desktop\Bharta Code\packages\agent"
node src/index.js
```

Then in another terminal:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:43120/health
```

Expected: HTTP 200 health payload.

## Electron Dev Verification

```powershell
cd "C:\Users\reetu\Desktop\Bharta Code\electron-app"
npm install
npm run build
npm run dev
```

Expected: Electron launches and agent service starts.

## Packaging Verification

```powershell
cd "C:\Users\reetu\Desktop\Bharta Code\electron-app"
npm run dist
```

Expected:

- Build succeeds for target platform.
- Packaged resources contain bundled agent and llama runtime resources.

## Offline-First Check

1. Disconnect network.
2. Start packaged app.
3. Verify local runtime health and local model listing continue to function.
