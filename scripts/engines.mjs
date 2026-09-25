// Same token, same moment, two Binance routing engines: Web3 REST aggregator vs Agentic Wallet (QUOTE ONLY).
//   node scripts/engines.mjs GOOGL ondo 10000
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, env } from '../src/env.mjs';
import * as bapi from '../src/bapi.mjs';
import * as w3 from '../src/web3api.mjs';
import { baw, pick } from '../src/baw.mjs';
import { USDT } from '../src/snapshot.mjs';
const [T = 'GOOGL', W = 'ondo', U = '10000'] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(join(ROOT, 'config/tokens.json'), 'utf8'));
const t = cfg.tickers[T.toUpperCase()], addr = t[W], usd = Number(U);
let stock = null; for (const w of ['ondo', 'bstocks']) if (t[w]) { stock ||= Number((await bapi.dynamic(t[w])).body?.data?.stockInfo?.price) || null; }
const mult = Number((await bapi.dynamic(addr)).body?.data?.tokenInfo?.sharesMultiplier || 1), fair = stock * mult;
const f = (x, d = 3) => (x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));
const line = (label, qty, extra = '') => console.log(`${label.padEnd(48)} ${qty ? `${f(qty, 6)} tokens  cost ${f(((usd / qty) / fair - 1) * 100)}%` : 'no quote'}  ${extra}`);
console.log(`\n${T} ${W} $${usd}  fair $${f(fair, 2)}  wallet ${env.WALLET_ADDRESS}  ${new Date().toISOString()}\n`);
const amt = (BigInt(usd) * 10n ** 18n).toString();
for (const [label, extra] of [['REST default', {}], ['REST vendor=Pancake', { vendor: 'Pancake' }], ['REST vendor=LiquidMesh', { vendor: 'LiquidMesh' }], ['REST no wallet', { userWalletAddress: '' }]]) {
  const q = { binanceChainId: '56', amount: amt, fromTokenAddress: USDT, toTokenAddress: addr, userWalletAddress: env.WALLET_ADDRESS, ...extra };
  if (!q.userWalletAddress) delete q.userWalletAddress;
  const r = await w3.web3('quote', 'GET', '/api/v1/dex/aggregator/quote', { query: q });
  const list = Array.isArray(r.body?.data) ? r.body.data : [];
  if (!list.length) { line(label, null, `(${r.body?.code} ${r.body?.msg})`); continue; }
  for (const x of list) line(`${label}: ${x.vendorName} ${x.executionMode}${x.isBest ? ' [isBest]' : ''}`, Number(x.toTokenAmount) / 1e18, (x.dexRouterList || []).map(d => `${d.dexProtocol?.dexName}:${d.dexProtocol?.percent}`).join('|'));
}
const b = baw(['market-order', 'quote', '--binanceChainId', '56', '--fromTokenQty', String(usd), '--fromToken', USDT, '--toToken', addr]);
line('Agentic Wallet (baw market-order quote)', Number(pick(b.json, ['toCoinAmount'])) || null, b.ok ? '' : b.raw.slice(0, 150));
