#!/usr/bin/env python3
"""
CodIn Agent Server - Main entry point
Provides AI4Bharat multilingual support and local LLM orchestration
"""

import sys
import os
import argparse
from pathlib import Path

# Add i18n/indic_server to Python path
AGENT_DIR = Path(__file__).parent
sys.path.insert(0, str(AGENT_DIR / "i18n" / "indic_server"))

def main():
    parser = argparse.ArgumentParser(description="CodIn Agent Server")
    parser.add_argument("--port", type=int, default=43120, help="Port to run the server on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    args = parser.parse_args()

    print(f"Starting CodIn Agent Server on {args.host}:{args.port}")
    print(f"Agent directory: {AGENT_DIR}")
    
    try:
        # Import and run the Flask server
        from server import app
        app.run(host=args.host, port=args.port, debug=False)
    except ImportError as e:
        print(f"ERROR: Failed to import Flask server: {e}")
        print("\nMake sure you have installed the required dependencies:")
        print("  pip install flask transformers torch")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Failed to start server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
