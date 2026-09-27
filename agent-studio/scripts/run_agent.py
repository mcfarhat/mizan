"""Start the Mizan Best-Execution Router (ERC-8183 provider).

Usage (from agent-studio/):
    python scripts/run_agent.py
    python scripts/run_agent.py --env .env.local
"""
import argparse
import os
import sys
from pathlib import Path

os.environ.setdefault("PYTHONUNBUFFERED", "1")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import uvicorn

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default=".env", help="env file name (relative to agent-studio/)")
    args = parser.parse_args()
    os.environ.setdefault("ENV_FILE", args.env)

    from service import app, PORT

    uvicorn.run(app, host="0.0.0.0", port=PORT)
