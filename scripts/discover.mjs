// Build the universe from Binance's official RWA lists (type 1=Ondo, 2=xStocks, 3=bStocks) on BSC,
// cross-check config/tokens.json, write config/universe.json (tickers with >=2 wrappers on BSC).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.mjs';
import * as bapi from '../src/bapi.mjs';

const TYPES = { 1: 'ondo', 2: 'xstocks', 3: 'bstocks' };
const uni = {};
for (const [type, w] of Object.entries(TYPES)) {
  const rows = (await bapi.stockList(type)).body?.data || [];
  for (const r of rows) if (r.chainId === '56')
    (uni[r.ticker] ||= {})[w] = { addr: r.contractAddress, symbol: r.symbol, assetType: r.assetType, multiplier: r.multiplier };
}
const multi = Object.fromEntries(Object.entries(uni).filter(([, v]) => Object.keys(v).length >= 2).sort());
const all3 = Object.keys(multi).filter(t => Object.keys(multi[t]).length === 3);
writeFileSync(join(ROOT, 'config/universe.json'), JSON.stringify({ at: new Date().toISOString(), tickers: multi }, null, 2));

const cfg = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
let bad = 0;
for (const [t, c] of Object.entries(cfg.tickers)) for (const w of Object.values(TYPES)) {
  if (!c[w]) continue;
  const off = uni[t]?.[w]?.addr;
  if (!off) { console.log(`?  ${t}/${w} not in official list`); bad++; }
  else if (off.toLowerCase() !== c[w].toLowerCase()) { console.log(`X  ${t}/${w} config ${c[w]} != official ${off}`); bad++; }
}
console.log(`BSC tickers: ${Object.keys(uni).length} total, ${Object.keys(multi).length} in >=2 wrappers, ${all3.length} in all 3`);
console.log(`All-3 tickers: ${all3.join(' ')}`);
console.log(bad ? `${bad} config mismatches (see above)` : 'config/tokens.json matches official lists');
