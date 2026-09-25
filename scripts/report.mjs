// Print the latest snapshot per ticker/wrapper from today's JSONL as a table.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.mjs';
const dir = join(ROOT, 'data');
const f = readdirSync(dir).filter(x => x.startsWith('snapshots-')).sort().pop();
const rows = readFileSync(join(dir, f), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const latest = {};
for (const r of rows) latest[r.ticker + '/' + r.wrapper] = r;
const x = (v, d = 2) => (v == null || Number.isNaN(v) ? '-' : v.toFixed(d));
const q = (r, u) => { const z = r.quotes?.[u]; if (!z) return '-'; if (z.err) return 'NOLIQ'; return `${x(z.costVsFairPct)}%`; };
console.log(`file ${f}  rows ${rows.length}  session ${Object.values(latest)[0]?.session}\n`);
console.log('symbol     premium   age(s)   cost vs fair:  $100     $1k      $10k    (reported impact @10k)');
for (const r of Object.values(latest))
  console.log(`${(r.symbol || r.ticker + '/' + r.wrapper).padEnd(10)} ${x(r.premiumPct, 3).padStart(7)}% ${String(r.priceAgeSec ?? '-').padStart(7)}   ${q(r, 100).padStart(9)} ${q(r, 1000).padStart(8)} ${q(r, 10000).padStart(9)}    ${x(r.quotes?.[10000]?.reportedImpactPct, 3)}%`);
