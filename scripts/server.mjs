// Mizan web: dashboard + JSON API (zero deps).  node scripts/server.mjs  -> http://localhost:8090
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { ROOT } from '../src/env.mjs';
import { loadRows, buildIndex, history } from '../src/analyze.mjs';
import { check } from '../src/check.mjs';
import { heatmap } from '../src/heatmap.mjs';
import { statSync, readdirSync } from 'node:fs';

const PORT = Number(process.env.PORT || 8090);
const PUB = join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const cfg = () => JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
let cache = { t: 0, rows: [] };
const rows = () => { if (Date.now() - cache.t > 30e3) cache = { t: Date.now(), rows: loadRows(24) }; return cache.rows; };
let hcache = { k: '', t: 0, v: null };
const heat = (days, size) => { const k = `${days}/${size}`; if (hcache.k !== k || Date.now() - hcache.t > 600e3) hcache = { k, t: Date.now(), v: heatmap({ days, size, cfg: cfg() }) }; return hcache.v; };
const newest = (prefix) => { try { const f = readdirSync(join(ROOT, 'data')).filter(x => x.startsWith(prefix)).sort().pop(); return f ? Math.round((Date.now() - statSync(join(ROOT, 'data', f)).mtimeMs) / 1000) : null; } catch { return null; } };
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/index') return json(res, buildIndex(rows(), cfg()));
    if (u.pathname === '/health' || u.pathname === '/api/health') {
      const snap = newest('snapshots-'), wal = newest('wallet-');
      const ok = snap != null && snap < 900;
      return json(res, { ok, service: 'mizan-web', uptimeSec: Math.round(process.uptime()), lastSnapshotAgeSec: snap, lastWalletQuoteAgeSec: wal, rows24h: rows().length }, ok ? 200 : 503);
    }
    if (u.pathname === '/api/heatmap') return json(res, heat(Math.min(Number(u.searchParams.get('days') || 7), 30), Number(u.searchParams.get('size') || 10000)));
    let c = u.pathname.match(/^\/api\/check\/([A-Za-z.]+)$/);   // best execution + go/no-go for one trade
    if (c) {
      const mc = u.searchParams.get('maxCost');
      const r = check(buildIndex(rows(), cfg()), c[1].toUpperCase(), Math.max(1, Number(u.searchParams.get('usd') || 1000)),
        { maxCostPct: mc == null ? 1 : Number(mc), channel: ['api', 'wallet'].includes(u.searchParams.get('channel')) ? u.searchParams.get('channel') : 'any' });
      return json(res, r, r.ok ? 200 : 404);
    }
    let m = u.pathname.match(/^\/api\/history\/([A-Z.]+)$/);
    if (m) return json(res, { ticker: m[1], size: Number(u.searchParams.get('size') || 10000), series: history(rows(), m[1], Number(u.searchParams.get('size') || 10000)) });
    m = u.pathname.match(/^\/api\/route\/([A-Z.]+)$/);   // "which wrapper should I buy for $X?"
    if (m) {
      const usd = Number(u.searchParams.get('usd') || 100);
      const t = buildIndex(rows(), cfg()).tickers.find(x => x.ticker === m[1]);
      if (!t) return json(res, { error: 'unknown ticker' }, 404);
      const cands = t.wrappers.map(w => {
        const sizes = Object.keys(w.quotes || {}).map(Number).filter(s => w.quotes[s]?.costVsFairPct != null).sort((a, b) => a - b);
        const s = sizes.find(x => x >= usd) ?? sizes.at(-1);
        return s == null ? null : { symbol: w.symbol, wrapper: w.wrapper, addr: w.addr, mode: w.quotes[s].mode, estCostVsFairPct: w.quotes[s].costVsFairPct, measuredAtUsd: s, safeSizeUsd: w.safeSizeUsd };
      }).filter(Boolean).sort((a, b) => a.estCostVsFairPct - b.estCostVsFairPct);
      return json(res, { ticker: t.ticker, usd, shariah: t.shariah, best: cands[0] || null, alternatives: cands.slice(1), at: t.at });
    }
    const f = join(PUB, u.pathname === '/' ? 'index.html' : u.pathname.replace(/\.\./g, ''));
    if (existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); return res.end(readFileSync(f)); }
    json(res, { error: 'not found' }, 404);
  } catch (e) { json(res, { error: e.message }, 500); }
}).listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`Mizan dashboard: http://${process.env.HOST || 'localhost'}:${PORT}`));
