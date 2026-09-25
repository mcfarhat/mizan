// Guarded execution of one basket leg: route via the Mizan index -> live Agentic Wallet quote -> fair-price guard -> swap.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ROOT } from './env.mjs';
import { loadRows, buildIndex } from './analyze.mjs';
import * as bapi from './bapi.mjs';
import { baw, pick } from './baw.mjs';
import { USDT } from './snapshot.mjs';

export const MAX_COST_PCT = 1.0;
// Learned minimums (Agentic Wallet rejects smaller orders with 315008 "From token value greater than 5 USD", i.e. min $5)
export const MIN_ORDER_USD = { ondo: 5 };
const cfg = () => JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
export const logTrade = (o) => { mkdirSync(join(ROOT, 'data'), { recursive: true }); appendFileSync(join(ROOT, 'data/trades.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n'); };
const f = (x, d = 3) => (x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));
export const balances = () => { const b = baw(['wallet', 'balance']); return { ok: b.ok, list: b.json?.data || [], raw: b.raw, ms: b.ms }; };
export const tokenBal = (list, addr) => Number(list.find(x => x.address?.toLowerCase() === addr.toLowerCase())?.balance || 0);

export function route(ticker, usd, index) {
  const idx = index || buildIndex(loadRows(6), cfg());
  const t = idx.tickers.find(x => x.ticker === ticker);
  if (!t) return { error: `no recent index data for ${ticker}` };
  const cands = t.wrappers.map(w => {
    const sizes = Object.keys(w.quotes || {}).map(Number).filter(s => w.quotes[s]?.costVsFairPct != null).sort((a, b) => a - b);
    const s = sizes.find(x => x >= usd) ?? sizes.at(-1);
    return s == null ? { w, blocked: w.flags.map(x => x.txt).join('; ') || 'no quotes' } : { w, cost: w.quotes[s].costVsFairPct, at: s };
  });
  const best = cands.filter(c => c.cost != null).sort((a, b) => a.cost - b.cost)[0];
  return { t, cands, best };
}

export async function buyLeg({ ticker, usd, interactive = false, maxCostPct = MAX_COST_PCT, planId = null, index = null, say = console.log }) {
  const r = route(ticker, usd, index);
  if (r.error) { say(`  ${ticker}: ${r.error}`); return { ticker, usd, ok: false, reason: r.error }; }
  const { t, cands } = r;
  say(`\n• $${usd} of ${ticker} (${t.shariah})`);
  for (const c of cands) say(`    ${(c.w.symbol || c.w.wrapper).padEnd(8)} ${c.cost != null ? `index cost ${f(c.cost)}%` : `BLOCKED: ${c.blocked}`}`);
  const ranked = cands.filter(c => c.cost != null).sort((a, b) => a.cost - b.cost);
  if (!ranked.length) { logTrade({ planId, ticker, usd, stage: 'route', ok: false, reason: 'no buyable wrapper' }); return { ticker, usd, ok: false, reason: 'no buyable wrapper' }; }
  const pre = balances();
  if (!pre.ok) { say('    wallet balance FAILED: ' + pre.raw.slice(0, 300)); return { ticker, usd, ok: false, reason: 'wallet unavailable (signed in?)' }; }
  const usdtBal = tokenBal(pre.list, USDT);
  if (usdtBal < usd) { say(`    SKIP: only ${f(usdtBal, 2)} USDT available`); logTrade({ planId, ticker, usd, stage: 'funds', ok: false, usdtBal }); return { ticker, usd, ok: false, reason: 'insufficient USDT' }; }
  // reference stock price (bStocks leaves it null -> borrow from another wrapper)
  let stock = null;
  for (const w of t.wrappers) { const x = Number((await bapi.dynamic(w.addr)).body?.data?.stockInfo?.price); if (x) { stock = x; break; } }
  // try wrappers fairest-first; fall back on minimum-size or quote failures
  let best = null, fair = null, qty = null, cost = null, lastReason = 'no quote';
  for (const c of ranked) {
    const min = MIN_ORDER_USD[c.w.wrapper];
    if (min && usd < min) { say(`    ${c.w.symbol}: $${usd} below its $${min} minimum -> next`); lastReason = `below ${c.w.symbol} minimum`; continue; }
    const d = (await bapi.dynamic(c.w.addr)).body?.data || {};
    const fr = (Number(d.stockInfo?.price) || stock) * Number(d.tokenInfo?.sharesMultiplier || 1);
    const q = baw(['market-order', 'quote', '--binanceChainId', '56', '--fromTokenQty', String(usd), '--fromToken', USDT, '--toToken', c.w.addr]);
    if (!q.ok) {
      const msg = q.json?.error?.message || q.raw.slice(0, 200);
      say(`    ${c.w.symbol}: quote failed (${q.json?.error?.code ?? '?'} ${msg}) -> next`);
      logTrade({ planId, ticker, usd, symbol: c.w.symbol, stage: 'quote', ok: false, raw: q.raw.slice(0, 2000) });
      lastReason = `quote failed: ${msg}`; continue;
    }
    best = c; fair = fr; qty = Number(pick(q.json, ['toCoinAmount', 'toTokenQty', 'toTokenAmount']));
    cost = qty && fair ? ((usd / qty) / fair - 1) * 100 : null;
    break;
  }
  if (!best) return { ticker, usd, ok: false, reason: lastReason };
  say(`    -> ${best.w.symbol}: quote ${f(qty, 6)} tokens = $${f(usd / qty, 2)} vs fair $${f(fair, 2)} => cost ${f(cost)}%`);
  if (maxCostPct == null) say('    (fair-price guard OFF for this plan)');
  if (maxCostPct != null && (cost == null || cost > maxCostPct)) {
    say(`    GUARD: cost ${f(cost)}% > ${maxCostPct}%, skipping this leg`);
    logTrade({ planId, ticker, usd, symbol: best.w.symbol, stage: 'guard', ok: false, fair, quotedQty: qty, quotedCostPct: cost });
    return { ticker, usd, ok: false, reason: `guard (${f(cost)}%)` };
  }
  if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const a = (await rl.question(`    Execute ${usd} USDT -> ${best.w.symbol}? [y/N] `)).trim().toLowerCase(); rl.close();
    if (!['y', 'yes', 'غ'].includes(a)) { say('    cancelled'); return { ticker, usd, ok: false, reason: 'cancelled' }; }
  }
  const s = baw(['market-order', 'swap', '--binanceChainId', '56', '--fromTokenQty', String(usd), '--fromToken', USDT, '--toToken', best.w.addr, '--slippage', '1']);
  const orderId = pick(s.json, ['orderId']);
  say(`    swap ${s.ok ? 'SUBMITTED' : 'FAILED'} order=${orderId ?? '-'} (${s.ms} ms)`);
  logTrade({ planId, ticker, usd, symbol: best.w.symbol, addr: best.w.addr, stage: 'swap', ok: s.ok, fair, preBalance: tokenBal(pre.list, best.w.addr), predictedCostPct: best.cost, quotedCostPct: cost, quotedQty: qty, orderId, result: s.json ?? s.raw.slice(0, 2000) });
  return { ticker, usd, ok: s.ok, symbol: best.w.symbol, orderId, quotedCostPct: cost, reason: s.ok ? null : 'swap failed' };
}
