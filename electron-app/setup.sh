#!/bin/bash
# CodIn Electron - Quick Setup Script for macOS/Linux

echo "🚀 CodIn Electron Setup"
echo "======================"
echo ""

# Check Node.js
echo "Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js found: $NODE_VERSION"
else
    echo "✗ Node.js not found! Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

# Check Python
echo "Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✓ Python found: $PYTHON_VERSION"
else
    echo "⚠ Python not found! Agent service needs Python 3.8+"
    echo "  Install with: brew install python3 (macOS) or apt install python3 (Linux)"
fi

# Check Git
echo "Checking Git installation..."
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    echo "✓ Git found: $GIT_VERSION"
else
    echo "⚠ Git not found! Git integration will not work"
    echo "  Install with: brew install git (macOS) or apt install git (Linux)"
fi

echo ""
echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "✗ npm install failed!"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

echo "Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "✗ Build failed!"
    exit 1
fi

echo "✓ Build complete"
echo ""

echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. npm run dev         - Run in development mode"
echo "  2. npm run watch:main  - Watch main process (separate terminal)"
echo "  3. npm run dist        - Build for production"
echo ""
echo "See GETTING_STARTED.md for detailed instructions"
