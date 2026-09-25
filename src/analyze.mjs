// Turn raw snapshots into the integrity index: per-ticker verdicts, traps, safe sizes, history.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';
import { SIZES, SAFE_PCT } from './snapshot.mjs';

const DATA = join(ROOT, 'data');
export const STALE_SEC = 3600;       // price older than 1h = stale
export const TRAP_PCT = 5;           // real cost > 5% over fair...
export const TRAP_IMPACT = 1;        // ...while the API claims < 1% impact

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
    if (q?.costVsFairPct > TRAP_PCT && (q.reportedImpactPct ?? 0) < TRAP_IMPACT) {
      f.push({ k: 'trap', size: u, txt: `$${fmtUsd(u)} "best" route costs +${q.costVsFairPct.toFixed(0)}% over fair; API reports ${q.reportedImpactPct?.toFixed(2)}% impact` });
      break;
    }
  }
  return f;
}
export const fmtAge = (s) => s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`;
export const fmtUsd = (u) => u >= 1000 ? `${u / 1000}k` : String(u);

export function buildIndex(rows, cfg) {
  const latest = {};
  for (const r of rows) latest[`${r.ticker}/${r.wrapper}`] = r;
  const byTicker = {};
  for (const r of Object.values(latest)) (byTicker[r.ticker] ||= []).push({ ...r, safeSizeUsd: safeSize(r), flags: flags(r) });

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
      ticker, shariah: cfg.tickers[ticker]?.shariah ?? 'unknown',
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
    const k = `${r.symbol}@${u}`; const p = (persist[k] ||= { symbol: r.symbol, size: u, n: 0, trapped: 0, worst: 0 });
    p.n++; if (q.costVsFairPct > TRAP_PCT && (q.reportedImpactPct ?? 0) < TRAP_IMPACT) p.trapped++;
    p.worst = Math.max(p.worst, q.costVsFairPct);
  }
  const traps = Object.values(persist).filter(p => p.trapped).sort((a, b) => b.worst - a.worst);
  const snapshots = new Set(rows.map(r => r.at.slice(0, 16))).size;
  return { generatedAt: new Date().toISOString(), sizes: SIZES, safePct: SAFE_PCT, trapPct: TRAP_PCT, window: { from: rows[0]?.at, to: rows.at(-1)?.at, rows: rows.length, passes: snapshots }, traps, tickers };
}

export function history(rows, ticker, size = 10000) {
  const out = {};
  for (const r of rows) if (r.ticker === ticker) {
    (out[r.symbol || r.wrapper] ||= []).push({ at: r.at, premium: r.premiumPct, cost: r.quotes?.[size]?.costVsFairPct ?? null, safe: r.safeSizeUsd ?? null });
  }
  return out;
}
