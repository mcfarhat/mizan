// Samples the Binance Agentic Wallet's own quotes (QUOTE ONLY, never swaps) so the index can compare
// channels: Web3 REST aggregator vs Agentic Wallet, for the same token and size.
// Core tickers x {ondo, bstocks} x {1000, 10000} every 15 min -> data/wallet-YYYY-MM-DD.jsonl
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.mjs';
import * as bapi from '../src/bapi.mjs';
import { baw, pick } from '../src/baw.mjs';
import { USDT } from '../src/snapshot.mjs';

const EVERY_MS = 15 * 60 * 1000;
const SIZES = [1000, 10000];
const once = process.argv.includes('--once');
mkdirSync(join(ROOT, 'data'), { recursive: true });

async function pass() {
  const t0 = Date.now();
  const st = baw(['wallet', 'status']);
  if (!st.ok) { console.log(`${new Date().toISOString()}  wallet not signed in / unavailable -> skip (${st.raw.slice(0, 120)})`); return; }
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
  const file = join(ROOT, 'data', `wallet-${new Date().toISOString().slice(0, 10)}.jsonl`);
  let n = 0, fail = 0;
  for (const [ticker, t] of Object.entries(cfg.tickers).filter(([, t]) => (t.tier || 'core') === 'core')) {
    const dyn = {}; let stock = null;
    for (const w of ['ondo', 'bstocks']) if (t[w]) { dyn[w] = (await bapi.dynamic(t[w])).body?.data || {}; stock ||= Number(dyn[w].stockInfo?.price) || null; }
    for (const w of ['ondo', 'bstocks']) if (t[w]) for (const usd of SIZES) {
      const fair = stock ? stock * Number(dyn[w].tokenInfo?.sharesMultiplier || 1) : null;
      const q = baw(['market-order', 'quote', '--binanceChainId', '56', '--fromTokenQty', String(usd), '--fromToken', USDT, '--toToken', t[w]]);
      const qty = Number(pick(q.json, ['toCoinAmount'])) || null;
      if (!qty) fail++;
      appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), channel: 'wallet', ticker, wrapper: w, symbol: dyn[w].symbol, addr: t[w], usd, qty, fair, costVsFairPct: qty && fair ? ((usd / qty) / fair - 1) * 100 : null, err: q.ok ? null : (q.json?.error?.message || q.raw.slice(0, 200)), ms: q.ms }) + '\n');
      n++;
    }
  }
  console.log(`${new Date().toISOString()}  wallet quotes=${n} failed=${fail}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await pass();
if (!once) setInterval(() => pass().catch(e => console.error(e)), EVERY_MS);
