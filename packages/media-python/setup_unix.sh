#!/usr/bin/env bash
# CodeIn Media Toolkit — Unix Setup Script (macOS / Linux)
# Sets up Python virtual environment + installs dependencies
# Usage: bash setup_unix.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "╔══════════════════════════════════════════╗"
echo "║   CodeIn Media Toolkit — Setup (Unix)    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Find Python ──────────────────────────────────────────
find_python() {
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null; then
            version=$($cmd --version 2>&1)
            if echo "$version" | grep -qE "Python 3\.(1[0-9]|[89])"; then
                echo "$cmd"
                return 0
            fi
        fi
    done
    return 1
}

PYTHON=$(find_python) || {
    echo "ERROR: Python 3.8+ not found. Install it first."
    echo "  macOS: brew install python3"
    echo "  Ubuntu: sudo apt install python3 python3-venv"
    exit 1
}

echo "Using Python: $($PYTHON --version)"

# ── Create Virtual Environment ───────────────────────────
if [ ! -d "$VENV_DIR" ]; then
    echo ""
    echo "Creating virtual environment in $VENV_DIR …"
    $PYTHON -m venv "$VENV_DIR"
    echo "  ✓ Virtual environment created"
else
    echo "Virtual environment already exists"
fi

VENV_PYTHON="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"

# ── Install Dependencies ─────────────────────────────────
echo ""
echo "Installing dependencies …"
"$VENV_PIP" install --upgrade pip
"$VENV_PIP" install -r "$SCRIPT_DIR/requirements.txt"
echo "  ✓ Dependencies installed"

# ── Check for GPU ────────────────────────────────────────
echo ""
echo "Checking GPU availability …"

# Check for NVIDIA GPU
if command -v nvidia-smi &>/dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "")
    if [ -n "$GPU_INFO" ]; then
        echo "  ✓ NVIDIA GPU detected: $GPU_INFO"
        echo "  Installing PyTorch with CUDA …"
        "$VENV_PIP" install torch torchvision --index-url https://download.pytorch.org/whl/cu121
    fi
# Check for Apple Silicon
elif [[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]]; then
    echo "  ✓ Apple Silicon detected (MPS acceleration available)"
    "$VENV_PIP" install torch torchvision
# Check for AMD ROCm
elif command -v rocm-smi &>/dev/null; then
    echo "  ✓ AMD ROCm detected"
    "$VENV_PIP" install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.0
else
    echo "  No GPU detected — installing CPU-only PyTorch"
    "$VENV_PIP" install torch torchvision --index-url https://download.pytorch.org/whl/cpu
fi

# ── Install imageio for video export ─────────────────────
"$VENV_PIP" install imageio[ffmpeg] 2>/dev/null || echo "  Note: imageio[ffmpeg] optional"

# ── Check Diagram Tools ──────────────────────────────────
echo ""
echo "Checking diagram tools …"
if command -v mmdc &>/dev/null; then
    echo "  ✓ Mermaid CLI (mmdc) found"
elif command -v npx &>/dev/null; then
    echo "  ✓ Mermaid available via npx"
else
    echo "  ⚠ Install Node.js for Mermaid diagram support"
    echo "    Or: npm i -g @mermaid-js/mermaid-cli"
fi

if command -v d2 &>/dev/null; then
    echo "  ✓ D2 found"
fi

if command -v plantuml &>/dev/null; then
    echo "  ✓ PlantUML found"
fi

# ── Verify ───────────────────────────────────────────────
echo ""
echo "Verifying installation …"
"$VENV_PYTHON" -c "import torch; print(f'  PyTorch {torch.__version__} (CUDA: {torch.cuda.is_available()}, MPS: {getattr(torch.backends, \"mps\", None) and torch.backends.mps.is_available()})')"
"$VENV_PYTHON" -c "import diffusers; print(f'  Diffusers {diffusers.__version__}')"
"$VENV_PYTHON" -c "import fastapi; print(f'  FastAPI {fastapi.__version__}')"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✓ Setup complete!                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "To start the media service:"
echo "  $VENV_PYTHON $SCRIPT_DIR/app.py"
echo ""
