// Turn raw snapshots into the integrity index: per-ticker verdicts, traps, safe sizes, history.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';
import { SIZES, SAFE_PCT } from './snapshot.mjs';

const DATA = join(ROOT, 'data');
export const STALE_SEC = 3600;       // price older than 1h = stale
export const TRAP_PCT = 5;           // trap = the aggregator's "best" route costs > 5% over fair value
// NOTE: the Web3 API field priceImpactPercent is a FRACTION (0.76 = 76%), not a percent.
// Verified against 2,530 quotes: it matches realized loss (median diff 0.06 pp). Displayed x100.

export function loadRows(hours = 24) {
  if (!existsSync(DATA)) return [];
  const since = Date.now() - hours * 3600e3;
  const files = readdirSync(DATA).filter(f => f.startsWith('snapshots-')).sort().slice(-2);
  const rows = [];
  for (const f of files) for (const l of readFileSync(join(DATA, f), 'utf8').split('\n')) {
    if (!l) continue;
    try { const r = JSON.parse(l); if (Date.parse(r.at) >= since) rows.push(r); } catch {}
  }
  return rows;
}

// Agentic Wallet quotes (channel comparison), from scripts/wallet-sampler.mjs
export function loadWallet(hours = 6) {
  if (!existsSync(DATA)) return {};
  const since = Date.now() - hours * 3600e3, latest = {};
  for (const f of readdirSync(DATA).filter(f => f.startsWith('wallet-')).sort().slice(-2))
    for (const l of readFileSync(join(DATA, f), 'utf8').split('\n')) {
      if (!l) continue; try { const r = JSON.parse(l); if (Date.parse(r.at) >= since && r.qty) latest[`${r.ticker}/${r.wrapper}/${r.usd}`] = r; } catch {}
    }
  return latest;
}
export function safeSize(r) {
  if (r.quotes?.[SIZES[0]]?.costVsFairPct == null) return null;
  let safe = 0;
  for (const u of SIZES) { const c = r.quotes?.[u]?.costVsFairPct; if (c == null) { if (r.quotes?.[u]) break; else continue; } if (c <= SAFE_PCT) safe = u; else break; }
  return safe;
}
function flags(r) {
  const f = [];
  if (r.priceAgeSec != null && r.priceAgeSec > STALE_SEC) f.push({ k: 'stale', txt: `price ${fmtAge(r.priceAgeSec)} old` });
  if (r.quotes?.[SIZES[0]]?.err) f.push({ k: 'noliq', txt: 'no liquidity, cannot be bought' });
  for (const u of SIZES) {
    const q = r.quotes?.[u];
    if (q?.costVsFairPct > TRAP_PCT) {
      const c = q.costVsFairPct > 1000 ? '>1000%' : `+${q.costVsFairPct.toFixed(0)}%`;
      f.push({ k: 'trap', size: u, txt: `$${fmtUsd(u)} "best" route costs ${c} over fair (loses ${((q.reportedImpactPct ?? 0) * 100).toFixed(0)}% of value)` });
      break;
    }
  }
  return f;
}
export const fmtAge = (s) => s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`;
export const fmtUsd = (u) => u >= 1000 ? `${u / 1000}k` : String(u);

export function buildIndex(rows, cfg, wallet = loadWallet()) {
  const latest = {};
  for (const r of rows) latest[`${r.ticker}/${r.wrapper}`] = r;
  const byTicker = {};
  for (const r of Object.values(latest)) {
    const wq = {}; for (const u of [1000, 10000]) { const x = wallet[`${r.ticker}/${r.wrapper}/${u}`]; if (x) wq[u] = { costVsFairPct: x.costVsFairPct, qty: x.qty, at: x.at }; }
    (byTicker[r.ticker] ||= []).push({ ...r, safeSizeUsd: safeSize(r), flags: flags(r), wallet: wq });
  }

  const tickers = Object.entries(byTicker).map(([ticker, ws]) => {
    // best route per size = lowest real cost over fair among wrappers that quote
    const bestBySize = {};
    for (const u of SIZES) {
      const cands = ws.map(w => ({ w: w.wrapper, symbol: w.symbol, c: w.quotes?.[u]?.costVsFairPct })).filter(x => x.c != null);
      cands.sort((a, b) => a.c - b.c);
      bestBySize[u] = cands[0] || null;
    }
    const safest = ws.filter(w => w.safeSizeUsd != null).sort((a, b) => (b.safeSizeUsd - a.safeSizeUsd) || ((a.quotes?.[SIZES[0]]?.costVsFairPct ?? 9) - (b.quotes?.[SIZES[0]]?.costVsFairPct ?? 9)))[0];
    return {
      ticker, shariah: cfg.tickers[ticker]?.shariah ?? 'unknown', tier: cfg.tickers[ticker]?.tier ?? 'core',
      session: ws[0]?.session, at: ws.map(w => w.at).sort().pop(),
      wrappers: ws.sort((a, b) => ['ondo', 'bstocks', 'xstocks'].indexOf(a.wrapper) - ['ondo', 'bstocks', 'xstocks'].indexOf(b.wrapper)),
      bestBySize, recommend: safest ? { wrapper: safest.wrapper, symbol: safest.symbol, safeSizeUsd: safest.safeSizeUsd } : null,
      traps: ws.flatMap(w => w.flags.filter(f => f.k === 'trap').map(f => ({ symbol: w.symbol, ...f }))),
    };
  }).sort((a, b) => a.ticker.localeCompare(b.ticker));

  // trap persistence over the window: share of snapshots where the trap fired
  const persist = {};
  for (const r of rows) for (const u of SIZES) {
    const q = r.quotes?.[u]; if (!q || q.costVsFairPct == null) continue;
    const sym = r.symbol || `${r.ticker}/${r.wrapper}`; const k = `${sym}@${u}`; const p = (persist[k] ||= { symbol: sym, size: u, n: 0, trapped: 0, worst: 0, costs: [] });
    p.n++; if (q.costVsFairPct > TRAP_PCT) { p.trapped++; p.costs.push(q.costVsFairPct); }
    p.worst = Math.max(p.worst, q.costVsFairPct);
  }
  // Rank by persistence first (share of snapshots trapped), then by typical (median) cost.
  // Costs > 1000% mean the pool ran dry at that size ("exhausted") - reported, but never used as a headline number.
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const traps = Object.values(persist).filter(p => p.trapped).map(({ costs, ...p }) => {
    const m = med(costs); return { ...p, rate: p.trapped / p.n, median: m, exhausted: m > 1000 };
  }).sort((a, b) => (b.rate - a.rate) || ((a.exhausted - b.exhausted)) || (b.median - a.median));
  const snapshots = new Set(rows.map(r => r.at.slice(0, 16))).size;
  const channels = [];
  for (const t of tickers) for (const w of t.wrappers) for (const u of [10000, 1000]) {
    const api = w.quotes?.[u]?.costVsFairPct, wal = w.wallet?.[u]?.costVsFairPct;
    if (api != null && wal != null) channels.push({ ticker: t.ticker, symbol: w.symbol, usd: u, apiCostPct: api, walletCostPct: wal, gap: api - wal, walletAt: w.wallet[u].at });
  }
  channels.sort((a, b) => b.gap - a.gap);
  return { generatedAt: new Date().toISOString(), sizes: SIZES, safePct: SAFE_PCT, trapPct: TRAP_PCT, window: { from: rows[0]?.at, to: rows.at(-1)?.at, rows: rows.length, passes: snapshots }, traps, channels, tickers };
}

export function history(rows, ticker, size = 10000) {
  const out = {};
  for (const r of rows) if (r.ticker === ticker) {
    (out[r.symbol || r.wrapper] ||= []).push({ at: r.at, premium: r.premiumPct, cost: r.quotes?.[size]?.costVsFairPct ?? null, safe: r.safeSizeUsd ?? null });
  }
  return out;
}
