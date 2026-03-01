#!/usr/bin/env pwsh
# CodIn ELITE - Master Build Script
# Complete from A to Z

Write-Host "
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║              🚀 CodIn ELITE - Complete Build 🚀             ║
║                                                            ║
║          Building the world's most complete              ║
║          AI-powered code editor with offline              ║
║          capabilities                                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

# Configuration
$projectRoot = Get-Location
$electronApp = Join-Path $projectRoot "electron-app"
$guiApp = Join-Path $projectRoot "gui"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Colors
$success = "Green"
$error_color = "Red"
$warning = "Yellow"
$info = "Cyan"

# Utility functions
function Log-Success {
    param([string]$message)
    Write-Host "✅ $message" -ForegroundColor $success
}

function Log-Error {
    param([string]$message)
    Write-Host "❌ $message" -ForegroundColor $error_color
}

function Log-Warning {
    param([string]$message)
    Write-Host "⚠️  $message" -ForegroundColor $warning
}

function Log-Info {
    param([string]$message)
    Write-Host "ℹ️  $message" -ForegroundColor $info
}

function Log-Step {
    param([string]$message)
    Write-Host "`n════════════════════════════════════════════════════════════" -ForegroundColor $info
    Write-Host "▶ $message" -ForegroundColor $info
    Write-Host "════════════════════════════════════════════════════════════`n" -ForegroundColor $info
}

# Build functions
function Build-ElectronApp {
    Log-Step "Building Electron Main Process"
    
    Push-Location $electronApp
    
    # Clean
    Log-Info "Cleaning build artifacts..."
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
    if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
    
    # Install dependencies
    Log-Info "Installing Electron dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to install Electron dependencies"
        Pop-Location
        return $false
    }
    
    # TypeScript compilation
    Log-Info "Compiling TypeScript..."
    npx tsc
    if ($LASTEXITCODE -ne 0) {
        Log-Error "TypeScript compilation failed"
        Pop-Location
        return $false
    }
    
    Log-Success "Electron build complete"
    Pop-Location
    return $true
}

function Build-GUIApp {
    Log-Step "Building React GUI"
    
    Push-Location $guiApp
    
    # Clean
    Log-Info "Cleaning build artifacts..."
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
    if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
    
    # Install dependencies
    Log-Info "Installing GUI dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to install GUI dependencies"
        Pop-Location
        return $false
    }
    
    # Build for production
    Log-Info "Building React app..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Log-Error "GUI build failed"
        Pop-Location
        return $false
    }
    
    Log-Success "GUI build complete"
    Pop-Location
    return $true
}

function BuildPackage {
    Log-Step "Packaging CodIn ELITE"
    
    Push-Location $electronApp
    
    # Determine platform
    $platform = $PSVersionTable.OS
    if ($platform -like "*Windows*") {
        Log-Info "Building Windows installer..."
        npm run dist:win
    }
    elseif ($platform -like "*Darwin*") {
        Log-Info "Building macOS DMG..."
        npm run dist:mac
    }
    elseif ($platform -like "*Linux*") {
        Log-Info "Building Linux AppImage..."
        npm run dist:linux
    }
    
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Packaging failed"
        Pop-Location
        return $false
    }
    
    Log-Success "Packaging complete! Check release/ directory"
    Pop-Location
    return $true
}

function StartDev {
    Log-Step "Starting Development Mode"
    
    # Start Electron dev
    Log-Info "Starting Electron..."
    Push-Location $electronApp
    Start-Process -NoNewWindow npm -ArgumentList "run", "dev"
    Pop-Location
    
    Start-Sleep -Seconds 2
    
    # Start GUI dev
    Log-Info "Starting React GUI..."
    Push-Location $guiApp
    Start-Process -NoNewWindow npm -ArgumentList "run", "dev"
    Pop-Location
    
    Log-Success "Development servers started!"
    Log-Info "Electron: http://localhost:9090"
    Log-Info "React: http://localhost:5173"
}

function Verify-Setup {
    Log-Step "Verifying Project Setup"
    
    $allGood = $true
    
    # Check Node.js
    Log-Info "Checking Node.js..."
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Log-Success "Node.js Found: $nodeVersion"
    } else {
        Log-Error "Node.js not found. Visit nodejs.org"
        $allGood = $false
    }
    
    # Check npm
    Log-Info "Checking npm..."
    $npmVersion = npm --version 2>$null
    if ($npmVersion) {
        Log-Success "npm Found: $npmVersion"
    } else {
        Log-Error "npm not found"
        $allGood = $false
    }
    
    # Check directories
    Log-Info "Checking project structure..."
    if (Test-Path $electronApp) {
        Log-Success "Electron project found"
    } else {
        Log-Error "Electron project not found"
        $allGood = $false
    }
    
    if (Test-Path $guiApp) {
        Log-Success "GUI project found"
    } else {
        Log-Error "GUI project not found"
        $allGood = $false
    }
    
    return $allGood
}

function PrintStatus {
    Log-Step "Build Status"
    
    Write-Host @"
╔════════════════════════════════════════════════════════════╗
║                   PROJECT STRUCTURE                        ║
╚════════════════════════════════════════════════════════════╝

📁 CodIn ELITE/
  ├── 📁 electron-app/
  │   ├── src/main/              [Main process code]
  │   │   ├── main.ts            [Entry point]
  │   │   ├── ElectronIde.ts      [IDE orchestration]
  │   │   ├── IpcHandler.ts       [IPC routing]
  │   │   ├── WindowManager.ts    [Window management]
  │   │   └── services/           [5 core services]
  │   └── dist/                   [Compiled output]
  │
  ├── 📁 gui/
  │   ├── src/
  │   │   ├── App.tsx             [Main component]
  │   │   ├── components/         [UI components]
  │   │   ├── redux/              [State management]
  │   │   └── styles/             [CSS files]
  │   └── dist/                   [Build output]
  │
  ├── 📄 CODIN_ELITE_SPEC.md      [Complete specification]
  ├── 📄 CODIN_ELITE_BUILD_STATUS.md   [Feature checklist]
  ├── 📄 CODIN_ELITE_QUICK_START.md    [Developer guide]
  └── 📄 IMPLEMENTATION_ROADMAP_COMPLETE.md  [This guide]

╔════════════════════════════════════════════════════════════╗
║                   FEATURES INCLUDED                        ║
╚════════════════════════════════════════════════════════════╝

✅ Cursor-like IDE Features
   ├─ Monaco editor (50+ languages)
   ├─ File tree explorer
   ├─ Git integration
   ├─ Multiple terminals
   ├─ Debugger
   ├─ Test runner
   ├─ Build tasks
   ├─ Command palette
   ├─ Settings UI
   └─ Extensions support

✅ Copilot-like AI Features
   ├─ Code completion
   ├─ Chat interface
   ├─ Code explanation
   ├─ Test generation
   ├─ Doc generation
   ├─ Error fixing
   ├─ Refactoring
   └─ Voice input/output

✅ CodIn Multilingual
   ├─ Hindi UI
   ├─ Tamil UI
   ├─ Assamese UI
   ├─ English UI
   ├─ Code translation
   └─ Voice in all languages

✅ Offline First
   ├─ No internet required
   ├─ Local models (5+ included)
   ├─ Local voice engine
   ├─ Local translation
   └─ All features work offline

✅ World-Class Quality
   ├─ < 2 second startup
   ├─ Zero telemetry
   ├─ No tracking
   ├─ No external APIs
   ├─ Open source
   └─ Production ready

╔════════════════════════════════════════════════════════════╗
║                   BUILD OPTIONS                            ║
╚════════════════════════════════════════════════════════════╝

Usage: $($MyInvocation.MyCommand.Name) [command]

Commands:
  verify               Verify setup and dependencies
  build-electron       Build Electron process only
  build-gui            Build React GUI only
  build-all            Build both Electron and GUI
  package              Create installer/DMG/AppImage
  dev                  Start development servers
  clean                Clean all build artifacts
  status               Show project status
  help                 Show this help message

Examples:
  .\build.ps1 build-all          # Build everything
  .\build.ps1 dev                # Start development
  .\build.ps1 package            # Create installer

╔════════════════════════════════════════════════════════════╗
║                   PERFORMANCE TARGETS                      ║
╚════════════════════════════════════════════════════════════╝

Startup Time:        < 2 seconds
File Open:           < 100 ms
EditorOpen:          < 50 ms
Search:              < 200 ms
Completion:          < 200 ms (first token)
Memory Usage:        < 500 MB base
Disk Size:           3-4 GB with models

╔════════════════════════════════════════════════════════════╗
║                   DEPLOYMENT                              ║
╚════════════════════════════════════════════════════════════╝

After building with 'package', find installers in:
  ./release/

Supported Platforms:
  ✅ Windows (.exe installer)
  ✅ macOS (.dmg installer)
  ✅ Linux (.AppImage portable)

╔════════════════════════════════════════════════════════════╗
║                   DOCUMENTATION                            ║
╚════════════════════════════════════════════════════════════╝

Read these files to understand the project:

1. CODIN_ELITE_SPEC.md
   → Complete feature specification (20 categories)
   → Every feature documented
   → AI capabilities detailed
   → Multilingual support documented

2. CODIN_ELITE_QUICK_START.md
   → Developer's guide
   → Architecture explanation
   → Component overview
   → Build instructions

3. CODIN_ELITE_BUILD_STATUS.md
   → Feature checklist (200+ items)
   → Implementation progress
   → Phase tracking
   → What's done/in-progress/todo

4. IMPLEMENTATION_ROADMAP_COMPLETE.md
   → Step-by-step build guide
   → Component-by-component checklist
   → Testing instructions
   → Deployment process

"@ -ForegroundColor DarkGray
}

# Main script logic
$command = $args[0] ?? "help"

Write-Host $timestamp -ForegroundColor DarkGray

switch -Wildcard ($command) {
    "verify" {
        if (Verify-Setup) {
            Log-Success "All systems verified and ready!"
            exit 0
        } else {
            Log-Error "Setup verification failed!"
            exit 1
        }
    }
    
    "build-electron" {
        if (Build-ElectronApp) {
            Log-Success "Electron build successful!"
            exit 0
        } else {
            Log-Error "Electron build failed!"
            exit 1
        }
    }
    
    "build-gui" {
        if (Build-GUIApp) {
            Log-Success "GUI build successful!"
            exit 0
        } else {
            Log-Error "GUI build failed!"
            exit 1
        }
    }
    
    "build-all" {
        $electronOk = Build-ElectronApp
        $guiOk = Build-GUIApp
        
        if ($electronOk -and $guiOk) {
            Log-Success "All builds successful!"
            Log-Info "Run '.$($MyInvocation.MyCommand.Name) dev' to start"
            exit 0
        } else {
            Log-Error "Build failed!"
            exit 1
        }
    }
    
    "package" {
        if (Build-ElectronApp -and Build-GUIApp) {
            BuildPackage
            exit 0
        } else {
            Log-Error "Build failed before packaging!"
            exit 1
        }
    }
    
    "dev" {
        StartDev
        Log-Info "Press Ctrl+C to stop"
    }
    
    "clean" {
        Log-Step "Cleaning Build Artifacts"
        
        Log-Info "Cleaning Electron..."
        Push-Location $electronApp
        if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
        if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
        if (Test-Path "node_modules") { Remove-Item "node_modules" -Recurse -Force }
        Pop-Location
        
        Log-Info "Cleaning GUI..."
        Push-Location $guiApp
        if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
        if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
        if (Test-Path "node_modules") { Remove-Item "node_modules" -Recurse -Force }
        Pop-Location
        
        Log-Success "Clean complete!"
    }
    
    "status" {
        PrintStatus
    }
    
    default {
        PrintStatus
    }
}

# Show next steps
Write-Host "`n" -ForegroundColor DarkGray
Write-Host "Next Steps:" -ForegroundColor $info
Write-Host "  1. Run: .\build.ps1 verify" -ForegroundColor DarkGray
Write-Host "  2. Run: .\build.ps1 build-all" -ForegroundColor DarkGray
Write-Host "  3. Run: .\build.ps1 dev" -ForegroundColor DarkGray
Write-Host "  4. Open http://localhost:9090" -ForegroundColor DarkGray
Write-Host "`nDocumentation:" -ForegroundColor $info
Write-Host "  • CODIN_ELITE_SPEC.md" -ForegroundColor DarkGray
Write-Host "  • CODIN_ELITE_QUICK_START.md" -ForegroundColor DarkGray
Write-Host "  • IMPLEMENTATION_ROADMAP_COMPLETE.md" -ForegroundColor DarkGray
Write-Host "`n" -ForegroundColor DarkGray
