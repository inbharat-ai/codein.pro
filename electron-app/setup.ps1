#!/usr/bin/env pwsh
# CodIn Electron - Quick Setup Script for Windows (PowerShell)

Write-Host "🚀 CodIn Electron Setup" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found! Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check Python
Write-Host "Checking Python installation..." -ForegroundColor Yellow
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonVersion = python --version
    Write-Host "✓ Python found: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "⚠ Python not found! Agent service needs Python 3.8+" -ForegroundColor Yellow
    Write-Host "  Download from: https://www.python.org/downloads/" -ForegroundColor Yellow
}

# Check Git
Write-Host "Checking Git installation..." -ForegroundColor Yellow
if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVersion = git --version
    Write-Host "✓ Git found: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "⚠ Git not found! Git integration will not work" -ForegroundColor Yellow
    Write-Host "  Download from: https://git-scm.com/downloads" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ npm install failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

Write-Host "Building application..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Build complete" -ForegroundColor Green
Write-Host ""

Write-Host "🎉 Setup complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. npm run dev         - Run in development mode" -ForegroundColor White
Write-Host "  2. npm run watch:main  - Watch main process (separate terminal)" -ForegroundColor White
Write-Host "  3. npm run dist        - Build for production" -ForegroundColor White
Write-Host ""
Write-Host "See GETTING_STARTED.md for detailed instructions" -ForegroundColor Cyan
