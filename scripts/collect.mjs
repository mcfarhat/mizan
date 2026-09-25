// Mizan collector: snapshot every ticker in config/tokens.json, append to data/snapshots-YYYY-MM-DD.jsonl
// Usage: node scripts/collect.mjs            (loop every 5 min)
//        node scripts/collect.mjs --once     (single pass)
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.mjs';
import { calls } from '../src/http.mjs';
import { snapshotTicker, marketContext, WRAPPERS } from '../src/snapshot.mjs';

const EVERY_MS = 5 * 60 * 1000;
const once = process.argv.includes('--once');
mkdirSync(join(ROOT, 'data'), { recursive: true });

async function pass() {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
  const t0 = Date.now(); calls.length = 0;
  const all = Object.values(cfg.tickers).flatMap(t => WRAPPERS.map(w => t[w]).filter(Boolean));
  const ctx = await marketContext(all);
  const file = join(ROOT, 'data', `snapshots-${new Date().toISOString().slice(0, 10)}.jsonl`);
  let n = 0;
  for (const [ticker, t] of Object.entries(cfg.tickers)) {
    try {
      for (const row of await snapshotTicker(ticker, t, ctx)) { appendFileSync(file, JSON.stringify(row) + '\n'); n++; }
    } catch (e) { console.error(ticker, e.message); }
  }
  const errs = calls.filter(c => c.status !== 200).length;
  console.log(`${new Date().toISOString()}  session=${ctx.session}  rows=${n}  calls=${calls.length} (non-200: ${errs})  ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${file}`);
}

await pass();
if (!once) setInterval(() => pass().catch(e => console.error(e)), EVERY_MS);
