# INSTALL & RUN SMOKE TEST — CodeIn Public Beta

## Windows

1. Extract `CodIn.exe` from `electron-app/release/win-unpacked/`
2. Double-click to launch
3. Confirm app window appears
4. Check logs at `%APPDATA%/CodeIn/logs/`
5. Llama server starts automatically (bundled binary)
6. Health endpoint: http://localhost:8080/health (should return 200 OK)
7. Run a prompt in the app; verify non-empty response
8. Exit app

## macOS

1. Mount `CodeIn-darwin-x64.dmg` (if available)
2. Drag app to Applications
3. Launch app
4. Check logs at `~/Library/Application Support/CodeIn/logs/`
5. Llama server starts automatically
6. Health endpoint: http://localhost:8080/health
7. Run a prompt; verify response
8. Exit app

## Linux

1. Extract `CodeIn-linux-x64.AppImage` (if available)
2. Make executable: `chmod +x CodeIn-linux-x64.AppImage`
3. Run: `./CodeIn-linux-x64.AppImage`
4. Check logs at `~/.config/CodeIn/logs/`
5. Llama server starts automatically
6. Health endpoint: http://localhost:8080/health
7. Run a prompt; verify response
8. Exit app

## Offline Ready Verification

- Disconnect from internet, launch app, run prompt
- Should get a valid response from local llama-server

## Smoke Status

- Manual steps provided for all OS
- Automated smoke script not present (can be added in future)
