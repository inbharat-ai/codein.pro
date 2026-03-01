"""
Setup script for AI4Bharat Indic Server
Creates virtual environment and installs dependencies
"""

import os
import sys
import subprocess
import venv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_DIR = os.path.join(SCRIPT_DIR, "venv")


def setup_venv():
    """Create and setup virtual environment"""
    print("Setting up Python virtual environment...")

    if not os.path.exists(VENV_DIR):
        print(f"Creating venv at {VENV_DIR}")
        venv.create(VENV_DIR, with_pip=True)
    else:
        print("Virtual environment already exists")

    # Determine pip executable
    if sys.platform == "win32":
        pip_executable = os.path.join(VENV_DIR, "Scripts", "pip.exe")
        python_executable = os.path.join(VENV_DIR, "Scripts", "python.exe")
    else:
        pip_executable = os.path.join(VENV_DIR, "bin", "pip")
        python_executable = os.path.join(VENV_DIR, "bin", "python")

    # Install dependencies
    print("Installing dependencies...")
    requirements = [
        "flask==3.0.0",
        "transformers==4.36.0",
        "torch==2.1.0",
        "sentencepiece==0.1.99",
    ]

    for req in requirements:
        print(f"Installing {req}...")
        subprocess.check_call([pip_executable, "install", req])

    print("Setup complete!")
    print(f"Python: {python_executable}")
    print(f"To start server: {python_executable} server.py")


if __name__ == "__main__":
    setup_venv()
