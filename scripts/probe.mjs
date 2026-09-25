// Mizan probe v2: hit every data source for one ticker, compute fair price / premium / slippage.
// Usage: node scripts/probe.mjs [TICKER]   (default NVDA)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, env } from '../src/env.mjs';
import { calls } from '../src/http.mjs';
import * as bapi from '../src/bapi.mjs';
import * as w3 from '../src/web3api.mjs';
import * as refs from '../src/refs.mjs';

const cfg = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
const T = (process.argv[2] || 'NVDA').toUpperCase();
const t = cfg.tickers[T];
if (!t) { console.error('Unknown ticker', T); process.exit(1); }
const wrappers = ['ondo', 'bstocks', 'xstocks'].filter(w => t[w]);
// RFQ quotes (Ondo, xStock) require userWalletAddress; quoting is read-only, any owned address works.
const QUOTE_WALLET = env.WALLET_ADDRESS || '0x0D5fc8904322FBFDa2Ea5D5B739891de9e75dDe4';
const out = { ticker: T, at: new Date().toISOString(), hasKey: w3.hasKey(), results: {}, summary: {} };
const R = (k, v) => { out.results[k] = v; return v; };
const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

console.log(`\n== Mizan probe v2: ${T} @ ${out.at} (web3 key: ${out.hasKey ? 'yes' : 'NO'}) ==\n`);

// 1. Official Binance RWA lists (type 1 = Ondo; try others for bStocks/xStocks)
const listed = {};
for (const type of [1, 2, 3, 4]) {
  const l = R(`bapi.stockList.type${type}`, await bapi.stockList(type));
  for (const row of (Array.isArray(l.body?.data) ? l.body.data : []))
    if (row.chainId === '56') listed[row.contractAddress.toLowerCase()] = { type, symbol: row.symbol, multiplier: row.multiplier };
}
out.addressCheck = Object.fromEntries(wrappers.map(w => [w, listed[t[w].toLowerCase()] || 'NOT-in-any-list']));

// 2. Session + per-wrapper dynamic data
R('bapi.marketStatus', await bapi.marketStatus());
const dyn = {};
for (const w of wrappers) dyn[w] = R(`bapi.dynamic.${w}`, await bapi.dynamic(t[w])).body?.data;

// 3. xStocks official multiplier (network param required)
if (t.xsym) for (const n of ['bsc', 'Binance Smart Chain']) {
  const m = R(`xstocks.multiplier.${n}`, await refs.xstockMult(t.xsym, n));
  if (m.status === 200) break;
}

// 4. Binance Web3 API
const quotes = {};
if (w3.hasKey()) {
  const mp = R('web3.marketPrice', await w3.marketPrice(wrappers.map(w => t[w])));
  out.marketPriceTimes = Object.fromEntries((mp.body?.data || []).map(x => [x.tokenContractAddress, new Date(x.time).toISOString()]));
  for (const w of wrappers) R(`web3.rwaPrice.${w}`, await w3.rwaPrice(t[w]));
  for (const usd of [100, 1000, 10000]) {
    for (const w of wrappers) {
      const amt = (BigInt(usd) * 10n ** 18n).toString(); // USDT has 18 decimals on BSC
      const q = R(`web3.quote.buy${usd}.${w}`, await w3.quote({ from: cfg.quote.USDT, to: t[w], amount: amt, wallet: QUOTE_WALLET }));
      const best = Array.isArray(q.body?.data) ? (q.body.data.find(x => x.isBest) || q.body.data[0]) : null;
      (quotes[w] ||= {})[usd] = best
        ? { mode: best.executionMode, vendor: best.vendorName, tokens: Number(best.toTokenAmount) / 10 ** Number(best.toToken?.decimal || 18), impactPct: num(best.priceImpactPercent) }
        : { error: q.body?.msg || q.err || q.status };
    }
  }
}

// 5. Summary: fair price = underlying stock price x shares multiplier
for (const w of wrappers) {
  const d = dyn[w] || {};
  const stock = num(d.stockInfo?.price) ?? num(dyn.ondo?.stockInfo?.price);
  const mult = num(d.tokenInfo?.sharesMultiplier) ?? 1;
  const onchain = num(d.tokenInfo?.price);
  const fair = stock ? stock * mult : null;
  const row = { symbol: d.symbol, onchain, stock, mult, fair, premiumPct: fair && onchain ? (onchain / fair - 1) * 100 : null, status: d.statusInfo?.reasonCode, quotes: {} };
  for (const [usd, q] of Object.entries(quotes[w] || {})) {
    if (q.tokens) { const eff = Number(usd) / q.tokens; row.quotes[usd] = { mode: q.mode, vendor: q.vendor, effPrice: eff, vsFairPct: fair ? (eff / fair - 1) * 100 : null }; }
    else row.quotes[usd] = { error: q.error };
  }
  out.summary[w] = row;
}

const dir = join(ROOT, 'probe-output'); mkdirSync(dir, { recursive: true });
const file = join(dir, `probe-${T}-${out.at.replace(/[:.]/g, '-')}.json`);
out.calls = calls;
writeFileSync(file, JSON.stringify(out, null, 2));

const f = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? '-' : x.toFixed(d));
console.log('Address check:', out.addressCheck);
console.log(`\nSession: ${out.results['bapi.marketStatus']?.body?.data?.marketStatus}\n`);
console.log('wrapper   on-chain    fair(stock*mult)  premium   | cost vs fair: $100 / $1k / $10k');
for (const [w, r] of Object.entries(out.summary)) {
  const qs = ['100', '1000', '10000'].map(u => { const q = r.quotes[u]; return !q ? '-' : q.error ? 'ERR' : `${f(q.vsFairPct)}%(${q.mode})`; }).join(' / ');
  console.log(`${(r.symbol || w).padEnd(9)} ${f(r.onchain).padStart(9)}   ${f(r.fair).padStart(9)}        ${f(r.premiumPct, 3).padStart(7)}%  | ${qs}`);
}
console.log('\nCall log:');
for (const c of calls) console.log(`  ${String(c.status || 'ERR').padEnd(4)} ${String(c.ms).padStart(5)}ms  ${c.label}${c.err ? '  ' + c.err : ''}`);
console.log('\nSaved:', file);
