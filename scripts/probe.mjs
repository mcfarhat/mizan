// Mizan day-1 probe: hit every data source once for one ticker, save raw output + latencies.
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
const out = { ticker: T, at: new Date().toISOString(), hasKey: w3.hasKey(), results: {} };
const R = (k, v) => { out.results[k] = v; };

console.log(`\n== Mizan probe: ${T} @ ${out.at} (web3 key: ${out.hasKey ? 'yes' : 'NO - public sources only'}) ==\n`);

// 1. Official Binance RWA list -> cross-check our seed addresses
const list = await bapi.stockList(1);
R('bapi.stockList', list);
const rows = JSON.stringify(list.body || '').toLowerCase();
out.addressCheck = Object.fromEntries(wrappers.map(w => [w, rows.includes(t[w].toLowerCase()) ? 'in-binance-list' : 'NOT-in-list']));

// 2. Market session + per-asset dynamic data
R('bapi.marketStatus', await bapi.marketStatus());
for (const w of wrappers) {
  R(`bapi.dynamic.${w}`, await bapi.dynamic(t[w]));
  R(`bapi.assetStatus.${w}`, await bapi.assetStatus(t[w]));
}

// 3. Independent references
R('pyth', await refs.pyth([t.pyth, t.pyth247].filter(Boolean)));
if (t.xsym) { R('xstocks.asset', await refs.xstock(t.xsym)); R('xstocks.multiplier', await refs.xstockMult(t.xsym)); }

// 4. Binance Web3 API (needs key)
if (w3.hasKey()) {
  R('web3.rwaPlatforms', await w3.rwaPlatforms());
  R('web3.rwaPrice', await w3.rwaPrice(wrappers.map(w => t[w])));
  R('web3.marketPrice', await w3.marketPrice(wrappers.map(w => t[w])));
  const usdt = cfg.quote.USDT, amt = (100n * 10n ** 18n).toString(); // $100 USDT (18 dec on BSC)
  for (const w of wrappers) {
    R(`web3.quote.buy100.${w}`, await w3.quote({ from: usdt, to: t[w], amount: amt, wallet: env.WALLET_ADDRESS }));
  }
}

// Save
const dir = join(ROOT, 'probe-output'); mkdirSync(dir, { recursive: true });
const file = join(dir, `probe-${T}-${out.at.replace(/[:.]/g, '-')}.json`);
out.calls = calls;
writeFileSync(file, JSON.stringify(out, null, 2));

// Console summary
console.log('Address check vs Binance official list:', out.addressCheck);
console.log('\nCall log (feeds docs/dx-journal.md):');
for (const c of calls) console.log(`  ${String(c.status || 'ERR').padEnd(4)} ${String(c.ms).padStart(5)}ms  ${c.label}${c.err ? '  ' + c.err : ''}`);
console.log('\nSaved:', file);
