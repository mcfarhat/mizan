// Thin wrapper around the Binance Agentic Wallet CLI (npx baw ... --json)
import { spawnSync } from 'node:child_process';
import { ROOT } from './env.mjs';

export function baw(args) {
  const t0 = Date.now();
  const r = spawnSync('npx', ['baw', ...args, '--json'], { cwd: ROOT, shell: true, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const i = out.indexOf('{');
  let json = null;
  if (i >= 0) { try { json = JSON.parse(out.slice(i, out.lastIndexOf('}') + 1)); } catch {} }
  return { ok: r.status === 0 && json?.success !== false, json, raw: out.trim(), ms: Date.now() - t0, args };
}
// find the first numeric field whose key matches one of the names, anywhere in an object
export function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj)) if (names.includes(k) && v != null && typeof v !== 'object') return v;
  for (const v of Object.values(obj)) { const x = pick(v, names); if (x !== undefined) return x; }
  return undefined;
}
