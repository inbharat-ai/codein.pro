# CodeIn Media Toolkit — Windows Setup Script
# Sets up Python virtual environment + installs dependencies
# Run: powershell -ExecutionPolicy Bypass -File setup_windows.ps1

param(
    [switch]$UseSystemPython,
    [string]$PythonPath = ""
)

$ErrorActionPreference = "Stop"
$MediaDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$VenvDir = Join-Path $MediaDir ".venv"

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   CodeIn Media Toolkit — Setup (Win)     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Find Python ──────────────────────────────────────────
function Find-Python {
    if ($PythonPath -and (Test-Path $PythonPath)) {
        return $PythonPath
    }

    $candidates = @("python3", "python", "py -3")
    foreach ($cmd in $candidates) {
        try {
            $version = & $cmd --version 2>&1
            if ($version -match "Python 3\.(1[0-9]|[89])") {
                Write-Host "  Found: $version" -ForegroundColor Green
                return $cmd
            }
        } catch {
            continue
        }
    }
    return $null
}

$python = Find-Python
if (-not $python) {
    Write-Host "ERROR: Python 3.8+ not found. Please install Python from https://python.org" -ForegroundColor Red
    exit 1
}

Write-Host "Using Python: $python" -ForegroundColor Green

# ── Create Virtual Environment ───────────────────────────
if (-not (Test-Path $VenvDir)) {
    Write-Host ""
    Write-Host "Creating virtual environment in $VenvDir …" -ForegroundColor Yellow
    & $python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create venv" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Virtual environment created" -ForegroundColor Green
} else {
    Write-Host "Virtual environment already exists" -ForegroundColor Green
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

# ── Install Dependencies ─────────────────────────────────
Write-Host ""
Write-Host "Installing dependencies …" -ForegroundColor Yellow
& $VenvPip install --upgrade pip
& $VenvPip install -r (Join-Path $MediaDir "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: pip install failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Dependencies installed" -ForegroundColor Green

# ── Check for GPU (optional) ─────────────────────────────
Write-Host ""
Write-Host "Checking GPU availability …" -ForegroundColor Yellow
try {
    $nvidiaSmi = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
    if ($nvidiaSmi) {
        Write-Host "  NVIDIA GPU detected: $nvidiaSmi" -ForegroundColor Green
        Write-Host "  Installing PyTorch with CUDA support …" -ForegroundColor Yellow
        & $VenvPip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
    } else {
        Write-Host "  No NVIDIA GPU detected — using CPU-only PyTorch" -ForegroundColor Yellow
        & $VenvPip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
    }
} catch {
    Write-Host "  nvidia-smi not found — installing CPU-only PyTorch" -ForegroundColor Yellow
    & $VenvPip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
}

# ── Install Mermaid CLI (optional) ───────────────────────
Write-Host ""
Write-Host "Checking diagram tools …" -ForegroundColor Yellow
$mmdc = Get-Command mmdc -ErrorAction SilentlyContinue
if (-not $mmdc) {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if ($npx) {
        Write-Host "  Mermaid CLI will use npx (no install needed)" -ForegroundColor Green
    } else {
        Write-Host "  NOTE: Install Node.js for Mermaid diagram support" -ForegroundColor Yellow
        Write-Host "  Or install globally: npm i -g @mermaid-js/mermaid-cli" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Mermaid CLI (mmdc) found" -ForegroundColor Green
}

# ── Verify Installation ──────────────────────────────────
Write-Host ""
Write-Host "Verifying installation …" -ForegroundColor Yellow
& $VenvPython -c "import torch; print(f'  PyTorch {torch.__version__} (CUDA: {torch.cuda.is_available()})')"
& $VenvPython -c "import diffusers; print(f'  Diffusers {diffusers.__version__}')"
& $VenvPython -c "import fastapi; print(f'  FastAPI {fastapi.__version__}')"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   Setup complete!                        ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "To start the media service:" -ForegroundColor Cyan
Write-Host "  $VenvPython $(Join-Path $MediaDir 'app.py')" -ForegroundColor White
Write-Host ""
