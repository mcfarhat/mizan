// Mizan web: dashboard + JSON API (zero deps).  node scripts/server.mjs  -> http://localhost:8090
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { ROOT } from '../src/env.mjs';
import { loadRows, buildIndex, history } from '../src/analyze.mjs';

const PORT = Number(process.env.PORT || 8090);
const PUB = join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const cfg = () => JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
let cache = { t: 0, rows: [] };
const rows = () => { if (Date.now() - cache.t > 30e3) cache = { t: Date.now(), rows: loadRows(24) }; return cache.rows; };
const json = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/api/index') return json(res, buildIndex(rows(), cfg()));
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
    if (existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); return res.end(readFileSync(f)); }
    json(res, { error: 'not found' }, 404);
  } catch (e) { json(res, { error: e.message }, 500); }
}).listen(PORT, () => console.log(`Mizan dashboard: http://localhost:${PORT}`));
