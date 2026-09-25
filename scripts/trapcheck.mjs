// QUOTE-ONLY check (no trades): does the Binance Agentic Wallet itself quote the trap routes?
// For each ticker, compares the Agentic Wallet quote for every wrapper against fair value, at the given sizes.
//   node scripts/trapcheck.mjs [GOOGL NVDA MSFT] [--sizes=1000,10000]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.mjs';
import * as bapi from '../src/bapi.mjs';
import { baw, pick } from '../src/baw.mjs';
import { USDT } from '../src/snapshot.mjs';

const cfg = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
const args = process.argv.slice(2);
const tickers = args.filter(a => !a.startsWith('--')).map(s => s.toUpperCase());
const sizes = (args.find(a => a.startsWith('--sizes='))?.split('=')[1] || '1000,10000').split(',').map(Number);
const list = tickers.length ? tickers : ['GOOGL', 'NVDA', 'MSFT'];
const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));
const out = { at: new Date().toISOString(), note: 'quote-only, nothing executed', rows: [] };

console.log(`\n== Agentic Wallet trap check (QUOTE ONLY, nothing is bought) · ${out.at} ==`);
for (const T of list) {
  const t = cfg.tickers[T]; if (!t) { console.log(`${T}: unknown`); continue; }
  let stock = null; const mult = {};
  for (const w of ['ondo', 'bstocks', 'xstocks']) if (t[w]) {
    const d = (await bapi.dynamic(t[w])).body?.data || {};
    stock ||= Number(d.stockInfo?.price) || null; mult[w] = Number(d.tokenInfo?.sharesMultiplier || 1);
  }
  console.log(`\n${T}  (stock $${f(stock)})`);
  for (const usd of sizes) for (const w of ['ondo', 'bstocks']) if (t[w]) {
    const fair = stock * mult[w];
    const q = baw(['market-order', 'quote', '--binanceChainId', '56', '--fromTokenQty', String(usd), '--fromToken', USDT, '--toToken', t[w]]);
    const qty = Number(pick(q.json, ['toCoinAmount', 'toTokenQty', 'toTokenAmount']));
    const value = qty * fair, cost = qty ? ((usd / qty) / fair - 1) * 100 : null;
    const row = { ticker: T, wrapper: w, usd, ok: q.ok, qty: qty || null, fair, valueUsd: qty ? value : null, lostUsd: qty ? usd - value : null, costPct: cost, err: q.ok ? null : (q.json?.error?.message || q.raw.slice(0, 160)) };
    out.rows.push(row);
    console.log(`  $${String(usd).padEnd(6)} ${w.padEnd(8)} ${q.ok ? `get ${f(qty, 6)} tokens = $${f(value)} of stock  -> ${cost > 5 ? 'TRAP ' : ''}cost ${f(cost)}%  (lose $${f(usd - value)})` : `quote failed: ${row.err}`}`);
  }
}
mkdirSync(join(ROOT, 'data'), { recursive: true });
const file = join(ROOT, 'data', `trapcheck-${out.at.replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nSaved ${file}`);
