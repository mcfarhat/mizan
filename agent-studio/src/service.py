"""Mizan Best-Execution Router: ERC-8183 provider agent.
A buyer (human or agent) hires it with a task like "NVDA 5000"; the deliverable is a signed, on-chain-anchored
best-execution report built from the live Mizan index (issuer x channel real costs vs fair).
Run:  python scripts/run_agent.py   (from agent-studio/)
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / os.path.basename(os.environ.get("ENV_FILE", ".env")))

from bnbagent.erc8183.config import ERC8183Config
from bnbagent.erc8183.negotiation import parse_job_description
from bnbagent.storage import LocalStorageProvider

from erc8183_server import create_erc8183_app
from mizan_task import run_task

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("mizan.router")

config = ERC8183Config.from_env(storage=LocalStorageProvider.from_env())
PORT = int(os.getenv("PORT", "8091"))


def on_job(job: dict) -> str:
    description = job.get("description", "") or ""
    task_text = description
    try:
        parsed = parse_job_description(description)
        t = parsed.get("task") if isinstance(parsed, dict) else getattr(parsed, "task", None)
        if t:
            task_text = t
    except Exception:
        pass
    logger.info(f"[on_job] job #{job.get('jobId') or job.get('id')}: task={task_text[:120]!r}")
    return run_task(task_text)


app = create_erc8183_app(config, on_job=on_job)


@app.get("/")
async def root():
    return {"service": "Mizan Best-Execution Router", "erc8183": "/erc8183",
            "task_format": "'<TICKER> <USD>' e.g. 'NVDA 5000'", "dashboard": "https://mizan.greateck.com"}
