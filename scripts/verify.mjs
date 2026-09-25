// Settle Mizan trades: look up each submitted Agentic Wallet order, record fill + tx, compare realized cost with the prediction.
//   node scripts/verify.mjs
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.mjs';
import { baw, pick } from '../src/baw.mjs';

const F = join(ROOT, 'data/trades.jsonl');
if (!existsSync(F)) { console.log('no trades yet'); process.exit(0); }
const rows = readFileSync(F, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const balNow = baw(['wallet', 'balance']);
const holding = (addr) => Number((balNow.json?.data || []).find(x => x.address?.toLowerCase() === (addr || '').toLowerCase())?.balance || 0);
const done = new Set(rows.filter(r => r.stage === 'verify' && ['FINISHED', 'FAILED'].includes(r.status)).map(r => r.orderId));
const f = (x, d = 3) => (x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));
for (const t of rows.filter(r => r.stage === 'swap' && r.orderId && !done.has(r.orderId))) {
  let q = baw(['market-order', 'list', '--orderId', t.orderId]);
  let o = q.json?.data?.list?.[0] ?? q.json?.data?.orders?.[0] ?? null;
  if (!o) {
    // Lookup by orderId came back empty -> scan recent orders and match by id or by target token + time
    console.log(`  (--orderId lookup returned ${JSON.stringify(q.json?.data ?? q.raw).slice(0, 120)}; scanning recent orders)`);
    q = baw(['market-order', 'list', '--binanceChainId', '56', '--pageSize', '20']);
    const list = q.json?.data?.list ?? q.json?.data?.orders ?? [];
    o = list.find(x => JSON.stringify(x).includes(t.orderId))
      ?? list.find(x => JSON.stringify(x).toLowerCase().includes((t.addr || '').toLowerCase()));
    if (!o) console.log('  recent orders raw:', JSON.stringify(q.json ?? q.raw).slice(0, 1500));
  }
  const status = pick(o, ['status', 'orderStatus']);
  const txHash = pick(o, ['txHash', 'transactionHash', 'hash']);
  const recv = Number(pick(o, ['toCoinAmount', 'toTokenAmount', 'toAmount', 'receivedAmount', 'actualToAmount']));
  // order object carries no fill amount -> fall back to wallet balance delta (post - pre)
  const got = recv || (status === 'FINISHED' ? holding(t.addr) - (t.preBalance ?? 0) : 0);
  const eff = got ? t.usd / got : null;
  const realized = eff && t.fair ? (eff / t.fair - 1) * 100 : null;
  console.log(`\n${t.at}  $${t.usd} -> ${t.symbol}  order ${t.orderId}`);
  console.log(`  status ${status ?? '?'}   received ${f(got, 6)} ${t.symbol}   tx ${txHash ?? '-'}`);
  console.log(`  cost vs fair: index predicted ${f(t.predictedCostPct)}%  | live quote ${f(t.quotedCostPct)}%  | REALIZED ${f(realized)}%`);
  if (txHash) console.log(`  https://bscscan.com/tx/${txHash}`);
  if (o && !status) console.log('  order raw:', JSON.stringify(o).slice(0, 1500));
  appendFileSync(F, JSON.stringify({ at: new Date().toISOString(), stage: 'verify', orderId: t.orderId, ticker: t.ticker, symbol: t.symbol, usd: t.usd, status, txHash, received: got || null, realizedCostPct: realized, predictedCostPct: t.predictedCostPct, quotedCostPct: t.quotedCostPct, order: o }) + '\n');
}

// Ground truth regardless of order API: what the wallet actually holds + recent tx history
console.log('\nWallet:', (balNow.json?.data || []).map(x => `${x.symbol} ${Number(x.balance).toFixed(6)} ($${Number(x.value).toFixed(2)})`).join(' | '));
const tx = baw(['wallet', 'tx-history']);
for (const x of (tx.json?.data?.transactions || []).slice(0, 6)) {
  const fee = x.txHashList?.[0]?.networkFee; const bnb = fee ? Number(fee.feeValue) / 10 ** Number(fee.feeTokenDecimals || 18) : null;
  console.log(`  ${x.txTime}  ${x.txType.padEnd(8)} ${x.status}  gas ${bnb != null ? bnb.toFixed(7) + ' BNB' : '-'}  ${x.txHash}`);
}
