// Single guarded buy:  node scripts/buy.mjs NVDA 5 [--yes]
import { buyLeg } from '../src/executor.mjs';
const [T, U] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!T || !(Number(U) > 0)) { console.log('usage: node scripts/buy.mjs TICKER USD [--yes]'); process.exit(1); }
const r = await buyLeg({ ticker: T.toUpperCase(), usd: Number(U), interactive: !process.argv.includes('--yes') });
console.log(r.ok ? '\nDone. Run verify.bat in ~30 s to settle.' : `\nNot executed: ${r.reason}`);
