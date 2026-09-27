"""Mizan best-execution report: turn a job's task text into a routing verdict from the live Mizan index.

Task examples:  "NVDA 5000"   "best route for $10k GOOGL"   "route MSFT 1000"
Deliverable: JSON with the fairest issuer+channel, real cost vs fair for every alternative
(Web3 API aggregator route and Binance Agentic Wallet quote), Shariah status and a plain-English verdict.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime, timezone

API = os.getenv("MIZAN_API", "http://127.0.0.1:8090")


def _get(path: str) -> dict:
    with urllib.request.urlopen(API + path, timeout=20) as r:
        return json.loads(r.read().decode())


def parse_task(text: str) -> tuple[str | None, float]:
    t = (text or "").upper().replace(",", "")
    usd = 1000.0
    m = re.search(r"\$?\s*(\d+(?:\.\d+)?)\s*(K)?\b", t)
    if m:
        usd = float(m.group(1)) * (1000 if m.group(2) else 1)
    idx = _get("/api/index")
    known = {x["ticker"] for x in idx.get("tickers", [])}
    words = re.findall(r"[A-Z]{1,6}", t)
    ticker = next((w for w in words if w in known), None)
    return ticker, usd


def run_task(text: str) -> str:
    ticker, usd = parse_task(text)
    now = datetime.now(timezone.utc).isoformat()
    if not ticker:
        return json.dumps({"ok": False, "error": "no known ticker in task", "task": text, "at": now,
                           "hint": "e.g. 'NVDA 5000' or 'best route for $10k GOOGL'"})
    route = _get(f"/api/route/{ticker}?usd={usd:g}")
    idx = _get("/api/index")
    t = next((x for x in idx["tickers"] if x["ticker"] == ticker), {})
    options = []
    for w in t.get("wrappers", []):
        sizes = sorted(int(s) for s, q in (w.get("quotes") or {}).items() if q.get("costVsFairPct") is not None)
        s = next((x for x in sizes if x >= usd), sizes[-1] if sizes else None)
        api = w["quotes"][str(s)]["costVsFairPct"] if s is not None else None
        wal = (w.get("wallet") or {})
        ws = next((x for x in sorted(int(k) for k in wal) if x >= usd), None) if wal else None
        options.append({
            "symbol": w.get("symbol"), "issuer": w.get("wrapper"), "token": w.get("addr"),
            "web3ApiCostPct": api, "web3ApiMeasuredAtUsd": s,
            "agenticWalletCostPct": wal[str(ws)]["costVsFairPct"] if ws is not None else None,
            "flags": [f.get("txt") for f in w.get("flags", [])],
        })
    cands = []
    for o in options:
        if o["web3ApiCostPct"] is not None: cands.append((o["web3ApiCostPct"], o["symbol"], "Web3 API aggregator", o["token"]))
        if o["agenticWalletCostPct"] is not None: cands.append((o["agenticWalletCostPct"], o["symbol"], "Binance Agentic Wallet", o["token"]))
    cands.sort()
    best = cands[0] if cands else None
    worst = cands[-1] if cands else None
    verdict = (f"Buy {ticker} via {best[1]} through the {best[2]}: about {best[0]:+.2f}% vs fair."
               + (f" Avoid {worst[1]} via {worst[2]} ({'>1000' if worst[0] > 1000 else f'{worst[0]:+.1f}'}% vs fair)." if worst and worst[0] > 1 else "")
               ) if best else "No fair route available right now."
    return json.dumps({
        "ok": bool(best), "service": "Mizan best-execution report", "at": now,
        "ticker": ticker, "usd": usd, "shariah": t.get("shariah"),
        "best": {"symbol": best[1], "channel": best[2], "token": best[3], "costVsFairPct": best[0]} if best else None,
        "options": options, "verdict": verdict,
        "method": "fair = underlying stock price x issuer shares multiplier; cost = real quoted fill vs fair. Source: https://mizan.greateck.com",
        "indexAt": t.get("at"), "apiRoute": route,
    })
