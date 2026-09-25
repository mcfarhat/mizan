// Turn plain English into a basket plan.  "$20 every week into halal AI"  ->  { usd: 20, every: 'week', weights: {NVDA:40,...} }
// Deterministic parser (no LLM needed): amount, cadence, preset name or theme keywords, Shariah screen always on.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.mjs';

const load = (f) => JSON.parse(readFileSync(join(ROOT, 'config', f), 'utf8'));
// screened = in the SPUS holdings (S&P 500 Shariah, AAOIFI-based; full list in config/shariah.json)
export const isScreened = (shariah) => /^SPUS/.test((shariah || '').trim());

// Shariah screen: ON by default. Turn off per plan with "--no-screen" / words like "unscreened", "no screen",
// "any stock", "not halal"; or globally with SHARIAH_SCREEN=off in .env.
export function screenWanted(text, env = process.env) {
  const s = (text || '').toLowerCase();
  if (/--no-screen|\bunscreened\b|\bno (shariah |halal )?screen\b|\bany stocks?\b|\bnot halal\b|\bwithout (the )?(shariah|halal)/.test(s)) return false;
  if (/--screen\b|\bhalal\b|\bshariah\b|\bsharia\b/.test(s)) return true;
  return String(env.SHARIAH_SCREEN || 'on').toLowerCase() !== 'off';
}
export function parsePlan(text, opts = {}) {
  const B = load('baskets.json'), T = load('tokens.json').tickers;
  const s = text.toLowerCase();
  const notes = [];
  const m = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:\$|usd|usdt|dollars?)?/);
  const usd = m ? Number(m[1]) : null;
  const every = /\b(daily|every day|each day|a day|per day)\b/.test(s) ? 'day'
    : /\b(monthly|every month|a month|per month)\b/.test(s) ? 'month'
    : /\b(weekly|every week|each week|a week|per week)\b/.test(s) ? 'week' : 'once';
  // 1) preset by id or name words
  const has = (a) => new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}([^a-z]|$)`).test(s);
  let presetId = Object.keys(B.presets).find(id => s.includes(id) || s.includes(B.presets[id].name.toLowerCase()) || (B.presets[id].aliases || []).some(has));
  let weights = {};
  if (presetId) { weights = { ...B.presets[presetId].weights }; notes.push(`preset: ${B.presets[presetId].name}`); }
  else {
    // 2) explicit tickers or theme keywords -> equal weight
    const words = new Set(s.split(/[^a-z0-9-]+/).flatMap(w => [w, w.replace(/s$/, '')]));
    const picked = Object.keys(T).filter(tk => words.has(tk.toLowerCase()) || (B.themes[tk] || []).some(k => words.has(k)));
    if (picked.length) { for (const tk of picked) weights[tk] = 1; notes.push(`matched: ${picked.join(', ')}`); }
    else { presetId = 'halal-core'; weights = { ...B.presets[presetId].weights }; notes.push('no theme recognised -> default Halal Core 5'); }
  }
  // 3) Shariah screen (on by default, can be switched off)
  const screen = opts.screen ?? screenWanted(text);
  if (screen) {
    for (const tk of Object.keys(weights)) {
      if (!isScreened(T[tk]?.shariah)) { notes.push(`removed ${tk} (Shariah screen: ${T[tk]?.shariah || 'unknown'})`); delete weights[tk]; }
    }
  } else notes.push('Shariah screen OFF');
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const legs = total ? Object.entries(weights).map(([ticker, w]) => ({ ticker, pct: (w / total) * 100, usd: usd ? Math.floor((usd * w / total) * 100) / 100 : null })) : [];
  return { text, usd, every, presetId: presetId || null, screen, legs, notes, ok: !!usd && legs.length > 0 };
}
