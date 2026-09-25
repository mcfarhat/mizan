// Mizan guarded buy through the Binance Agentic Wallet.
//   node scripts/buy.mjs NVDA 5          -> route via index, quote, ask for confirmation, swap
//   node scripts/buy.mjs NVDA 5 --yes    -> no confirmation prompt (agent mode)
// Guards: never buys a wrapper flagged no-liquidity; aborts if the live quote costs > MAX_COST_PCT over fair.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ROOT } from '../src/env.mjs';
import { loadRows, buildIndex } from '../src/analyze.mjs';
import * as bapi from '../src/bapi.mjs';
import { baw, pick } from '../src/baw.mjs';
import { USDT } from '../src/snapshot.mjs';

const MAX_COST_PCT = 1.0;
const [T, USD_S] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const YES = process.argv.includes('--yes');
const usd = Number(USD_S);
if (!T || !(usd > 0)) { console.log('usage: node scripts/buy.mjs TICKER USD [--yes]'); process.exit(1); }
const cfg = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
const log = (o) => { mkdirSync(join(ROOT, 'data'), { recursive: true }); appendFileSync(join(ROOT, 'data/trades.jsonl'), JSON.stringify(o) + '\n'); };
const f = (x, d = 3) => (x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));

// 1. Route from the integrity index
const idx = buildIndex(loadRows(6), cfg);
const t = idx.tickers.find(x => x.ticker === T.toUpperCase());
if (!t) { console.log('No recent index data for', T); process.exit(1); }
const cands = t.wrappers.map(w => {
  const sizes = Object.keys(w.quotes || {}).map(Number).filter(s => w.quotes[s]?.costVsFairPct != null).sort((a, b) => a - b);
  const s = sizes.find(x => x >= usd) ?? sizes.at(-1);
  return s == null ? { w, blocked: w.flags.map(x => x.txt).join('; ') || 'no quotes' } : { w, cost: w.quotes[s].costVsFairPct, at: s };
});
console.log(`\n== Mizan buy: $${usd} of ${t.ticker} (${t.shariah}) ==\nIndex (as of ${t.at}):`);
for (const c of cands) console.log(`  ${(c.w.symbol || c.w.wrapper).padEnd(8)} ${c.cost != null ? `real cost ${f(c.cost)}% vs fair (measured at $${c.at})` : `BLOCKED: ${c.blocked}`}`);
const best = cands.filter(c => c.cost != null).sort((a, b) => a.cost - b.cost)[0];
if (!best) { console.log('No buyable wrapper. Abort.'); process.exit(1); }
console.log(`-> route: ${best.w.symbol} (${best.w.addr})`);

// 2. Live fair price + live Agentic Wallet quote
const d = (await bapi.dynamic(best.w.addr)).body?.data || {};
let stock = Number(d.stockInfo?.price);
if (!stock) for (const w of t.wrappers) { const x = Number((await bapi.dynamic(w.addr)).body?.data?.stockInfo?.price); if (x) { stock = x; break; } }
const fair = stock * Number(d.tokenInfo?.sharesMultiplier || 1);
const bal = baw(['wallet', 'balance']);
const tokBal = (b, addr) => Number((b.json?.data || []).find(x => x.address?.toLowerCase() === addr.toLowerCase())?.balance || 0);
console.log(`\nWallet balance check: ${bal.ok ? 'ok' : 'FAILED'} (${bal.ms} ms)`);
if (!bal.ok) { console.log(bal.raw.slice(0, 800)); process.exit(1); }
const q = baw(['market-order', 'quote', '--binanceChainId', '56', '--fromTokenQty', String(usd), '--fromToken', USDT, '--toToken', best.w.addr]);
console.log(`Agentic Wallet quote: ${q.ok ? 'ok' : 'FAILED'} (${q.ms} ms)`);
if (!q.ok) { console.log(q.raw.slice(0, 1500)); log({ at: new Date().toISOString(), ticker: t.ticker, usd, symbol: best.w.symbol, stage: 'quote', ok: false, raw: q.raw.slice(0, 3000) }); process.exit(1); }
const outQty = Number(pick(q.json, ['toCoinAmount', 'toTokenQty', 'toTokenAmount', 'toAmount', 'amountOut', 'receiveAmount', 'estimatedToTokenQty']));
const eff = outQty ? usd / outQty : null;
const cost = eff && fair ? (eff / fair - 1) * 100 : null;
console.log(`  receive ~${f(outQty, 6)} ${best.w.symbol}  => effective $${f(eff, 2)} vs fair $${f(fair, 2)}  => cost ${f(cost)}%`);
if (!outQty) console.log('  (could not parse quantity; raw quote below)\n' + JSON.stringify(q.json, null, 1).slice(0, 1500));
if (cost == null || cost > MAX_COST_PCT) { console.log(`\nABORT: cost ${f(cost)}% exceeds guard ${MAX_COST_PCT}% (or unknown).`); log({ at: new Date().toISOString(), ticker: t.ticker, usd, symbol: best.w.symbol, stage: 'guard', fair, eff, cost, quote: q.json }); process.exit(1); }

// 3. Confirm + execute
if (!YES) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`\nExecute: swap ${usd} USDT -> ${best.w.symbol}? [y/N] `)).trim().toLowerCase(); rl.close();
  if (a !== 'y') { console.log('Cancelled.'); process.exit(0); }
}
const s = baw(['market-order', 'swap', '--binanceChainId', '56', '--fromTokenQty', String(usd), '--fromToken', USDT, '--toToken', best.w.addr, '--slippage', '1']);
const txHash = pick(s.json, ['txHash', 'transactionHash', 'hash']);
const orderId = pick(s.json, ['orderId', 'id']);
console.log(`\nSwap: ${s.ok ? 'SUBMITTED' : 'FAILED'} (${s.ms} ms)  order=${orderId ?? '-'}  tx=${txHash ?? '-'}`);
console.log(JSON.stringify(s.json ?? s.raw, null, 1).slice(0, 2000));
log({ at: new Date().toISOString(), ticker: t.ticker, usd, symbol: best.w.symbol, addr: best.w.addr, stage: 'swap', ok: s.ok, fair, preBalance: tokBal(bal, best.w.addr), predictedCostPct: best.cost, quotedCostPct: cost, quotedQty: outQty, orderId, txHash, result: s.json ?? s.raw.slice(0, 3000) });
if (txHash) console.log(`BscScan: https://bscscan.com/tx/${txHash}`);
