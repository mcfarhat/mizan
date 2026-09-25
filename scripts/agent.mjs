// Mizan basket agent.
//   node scripts/agent.mjs plan "$20 every week into halal AI"   -> preview + save the plan
//   node scripts/agent.mjs list                                   -> saved plans
//   node scripts/agent.mjs run [--force]                          -> execute plans that are due (guarded auto)
//   node scripts/agent.mjs loop                                   -> check every 10 min, forever
//   node scripts/agent.mjs cancel <id>
// Options on plan:  --no-screen (skip Shariah screen)   --max-cost=0.5 (fair-price guard %, default 1, 'off' disables)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.mjs';
import { parsePlan } from '../src/planner.mjs';
import { buyLeg } from '../src/executor.mjs';
import { loadRows, buildIndex } from '../src/analyze.mjs';

const PF = join(ROOT, 'data/plans.json');
const MIN_LEG = 1; // USD
const load = () => (existsSync(PF) ? JSON.parse(readFileSync(PF, 'utf8')) : []);
const save = (p) => { mkdirSync(join(ROOT, 'data'), { recursive: true }); writeFileSync(PF, JSON.stringify(p, null, 2)); };
const STEP = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5 };
const [cmd, ...rest] = process.argv.slice(2);

function show(p) {
  console.log(`  "${p.text}"`);
  console.log(`  $${p.usd} ${p.every === 'once' ? 'one time' : 'every ' + p.every}  ·  ${p.notes.join(' · ')}`);
  for (const l of p.legs) console.log(`    ${l.ticker.padEnd(6)} ${l.pct.toFixed(0).padStart(3)}%  $${l.usd}`);
}

async function runPlan(p) {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
  const index = buildIndex(loadRows(6), cfg);
  console.log(`\n== Running plan ${p.id}: $${p.usd} ${p.every} ==`);
  const results = [];
  for (const l of p.legs) {
    if (l.usd < MIN_LEG) { console.log(`  ${l.ticker}: $${l.usd} below $${MIN_LEG} minimum, skipped`); results.push({ ticker: l.ticker, ok: false, reason: 'below minimum' }); continue; }
    results.push(await buyLeg({ ticker: l.ticker, usd: l.usd, planId: p.id, index, maxCostPct: p.maxCostPct === undefined ? 1 : p.maxCostPct }));
  }
  const done = results.filter(r => r.ok);
  console.log(`\n  ${done.length}/${results.length} legs executed: ${results.map(r => `${r.ticker} ${r.ok ? 'OK via ' + r.symbol : 'skipped (' + r.reason + ')'}`).join(' | ')}`);
  return results;
}

if (cmd === 'plan') {
  const opt = rest.filter(a => a.startsWith('--'));
  const text = rest.filter(a => !a.startsWith('--max-cost')).join(' ');
  const p = parsePlan(text);
  const mc = opt.find(a => a.startsWith('--max-cost='))?.split('=')[1];
  p.maxCostPct = mc == null ? 1 : mc === 'off' ? null : Number(mc);
  p.notes.push(p.maxCostPct == null ? 'fair-price guard OFF' : `fair-price guard ${p.maxCostPct}%`);
  console.log('\nPlan preview:'); show(p);
  if (!p.ok) { console.log('\nCould not build a plan (need an amount and at least one screened stock).'); process.exit(1); }
  const plans = load();
  const id = 'p' + (Date.now() % 1e8).toString(36);
  plans.push({ id, ...p, createdAt: new Date().toISOString(), nextRun: new Date().toISOString(), active: true, runs: [] });
  save(plans);
  console.log(`\nSaved as ${id}. First run happens on the next 'run' (now), then every ${p.every}.`);
} else if (cmd === 'list') {
  const plans = load();
  if (!plans.length) console.log('no plans');
  for (const p of plans) { console.log(`\n${p.id} ${p.active ? 'ACTIVE' : 'cancelled'}  next ${p.nextRun}  runs ${p.runs.length}`); show(p); }
} else if (cmd === 'cancel') {
  const plans = load(); const p = plans.find(x => x.id === rest[0]);
  if (p) { p.active = false; save(plans); console.log('cancelled', p.id); } else console.log('no such plan');
} else if (cmd === 'run' || cmd === 'loop') {
  const tick = async () => {
    const plans = load(); const now = Date.now(); let any = false;
    for (const p of plans.filter(x => x.active && (rest.includes('--force') || Date.parse(x.nextRun) <= now))) {
      any = true;
      const results = await runPlan(p);
      p.runs.push({ at: new Date().toISOString(), results });
      if (p.every === 'once') p.active = false; else p.nextRun = new Date(now + STEP[p.every]).toISOString();
      save(plans);
    }
    if (!any) console.log(`${new Date().toISOString()}  no plans due`);
  };
  await tick();
  if (cmd === 'loop') setInterval(() => tick().catch(e => console.error(e)), 10 * 60e3);
} else {
  console.log('usage: agent.mjs plan "<text>" | list | run [--force] | loop | cancel <id>');
}
