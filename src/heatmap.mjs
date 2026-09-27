// Cost by hour of day (UTC) per issuer: shows when tokenized-stock liquidity collapses (after US hours, weekends).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';

const DATA = join(ROOT, 'data');
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export function heatmap({ days = 7, size = 10000, tier = 'core', cfg } = {}) {
  if (!existsSync(DATA)) return { cells: {} };
  const since = Date.now() - days * 86400e3;
  const core = cfg ? new Set(Object.entries(cfg.tickers).filter(([, v]) => (v.tier ?? 'core') === tier).map(([k]) => k)) : null;
  const acc = {};   // issuer -> weekday|weekend -> hour -> { costs[], trapped, n }
  let n = 0, from = null, to = null;
  for (const f of readdirSync(DATA).filter(f => f.startsWith('snapshots-')).sort().slice(-(days + 1))) {
    for (const l of readFileSync(join(DATA, f), 'utf8').split('\n')) {
      if (!l) continue;
      let r; try { r = JSON.parse(l); } catch { continue; }
      const t = Date.parse(r.at); if (t < since) continue;
      if (core && !core.has(r.ticker)) continue;
      const q = r.quotes?.[size]; if (!q) continue;
      const d = new Date(t), day = (d.getUTCDay() === 0 || d.getUTCDay() === 6) ? 'weekend' : 'weekday', h = d.getUTCHours();
      const c = (((acc[r.wrapper] ||= {})[day] ||= {})[h] ||= { costs: [], trapped: 0, noliq: 0, n: 0 });
      c.n++; n++;
      if (q.costVsFairPct == null) c.noliq++;
      else { c.costs.push(q.costVsFairPct); if (q.costVsFairPct > 5) c.trapped++; }
      from = from && from < r.at ? from : r.at; to = to && to > r.at ? to : r.at;
    }
  }
  const cells = {};
  for (const [w, byDay] of Object.entries(acc)) for (const [day, byH] of Object.entries(byDay)) for (const [h, c] of Object.entries(byH))
    ((cells[w] ||= {})[day] ||= {})[h] = { median: med(c.costs), trapRate: c.costs.length ? c.trapped / c.costs.length : null, noLiqRate: c.noliq / c.n, n: c.n };
  return { size, days, tier, samples: n, from, to, usSessionUtc: '13:30-20:00 (EDT)', cells };
}
