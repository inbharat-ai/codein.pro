@echo off
REM CodIn Agent Setup Script
REM Installs Python dependencies for AI4Bharat multilingual support

echo ========================================
echo CodIn Agent Setup
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python 3 is not installed or not in PATH
    echo Please install Python 3.9 or later from https://www.python.org/
    pause
    exit /b 1
)

echo Python found:
python --version
echo.

REM Navigate to agent directory
cd /d "%~dp0packages\agent"

REM Check if requirements are already installed
echo Checking if dependencies are already installed...
python -m pip show -f ai4bharat >nul 2>&1
if %errorlevel% equ 0 (
    echo Dependencies already installed. Skipping installation.
    goto setup_complete
)

echo Installing Python dependencies...
echo This may take a few minutes...
echo.

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

:setup_complete
echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo You can now start CodIn with full multilingual support.
echo The agent will download translation models on first use.
echo.
pause
