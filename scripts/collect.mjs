// Mizan collector: snapshot every ticker in config/tokens.json, append to data/snapshots-YYYY-MM-DD.jsonl
// Usage: node scripts/collect.mjs            (loop every 5 min)
//        node scripts/collect.mjs --once     (single pass)
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.mjs';
import { calls } from '../src/http.mjs';
import { snapshotTicker, marketContext, WRAPPERS, SIZES } from '../src/snapshot.mjs';

// core tickers: full size ladder every pass; extended: 3 sizes, a rotating third of them each pass (~15 min refresh)
const EXT_SIZES = [100, 1000, 10000];
const EXT_SLICES = 3;
let passNo = 0;

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
  const entries = Object.entries(cfg.tickers);
  const core = entries.filter(([, t]) => (t.tier || 'core') === 'core');
  const ext = entries.filter(([, t]) => t.tier === 'extended').filter((_, i) => i % EXT_SLICES === passNo % EXT_SLICES);
  passNo++;
  for (const [ticker, t, sizes] of [...core.map(([a, b]) => [a, b, SIZES]), ...ext.map(([a, b]) => [a, b, EXT_SIZES])]) {
    try {
      for (const row of await snapshotTicker(ticker, t, ctx, sizes)) { appendFileSync(file, JSON.stringify(row) + '\n'); n++; }
    } catch (e) { console.error(ticker, e.message); }
  }
  const errs = calls.filter(c => c.status !== 200).length;
  console.log(`${new Date().toISOString()}  session=${ctx.session}  rows=${n}  calls=${calls.length} (non-200: ${errs})  ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${file}`);
}

await pass();
if (!once) setInterval(() => pass().catch(e => console.error(e)), EVERY_MS);
