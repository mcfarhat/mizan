// Minimal .env loader (zero deps)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = join(ROOT, '.env');
if (existsSync(p)) {
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
export const env = process.env;
