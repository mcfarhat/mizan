// Hire the Mizan agent end-to-end on BSC TESTNET (ERC-8183), as an outside buyer would.
//   node scripts/hire-test.mjs hire ["GOOGL 10000"]   negotiate -> createJob -> registerJob -> setBudget -> approve -> fund -> wait -> read report
//   node scripts/hire-test.mjs status <jobId>
//   node scripts/hire-test.mjs settle <jobId>          after the dispute window: releases the escrow to the agent
// The buyer is a throwaway testnet key kept in data/buyer.env (gitignored). It is created on first run and
// topped up with a little tBNB from the agent's own testnet balance, plus $U from the public testnet faucet.
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, http, getAddress, parseUnits, formatUnits, parseEther } from 'viem';
import { bscTestnet } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { ROOT } from '../src/env.mjs';

const RPC = 'https://bsc-testnet-rpc.publicnode.com';
const A = {
  commerce: '0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de',
  router: '0xd7d36d66d2f1b608a0f943f722d27e3744f66f25',
  policy: '0xd6a4217588f6b1f5657a92a3e94e6422ad771cea',
  token: '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565', // $U (testnet)
  faucet: '0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3', // requestTokens(): 10 $U / 30 min
};
const STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'];
const abi = n => { const r = JSON.parse(readFileSync(join(ROOT, 'abis', n + '.json'), 'utf8')); return Array.isArray(r) ? r : r.abi; };
const ABI = { commerce: abi('AgenticCommerce'), router: abi('EvaluatorRouter'), policy: abi('OptimisticPolicy'), erc20: abi('ERC20') };
const TX = h => `https://testnet.bscscan.com/tx/${h}`;

const readEnv = p => existsSync(p) ? Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()])) : {};
const agentEnv = readEnv(join(ROOT, 'agent-studio/.env'));
if (!/^0x[0-9a-fA-F]{64}$/.test(agentEnv.PRIVATE_KEY || '')) { console.log('No agent key in agent-studio/.env'); process.exit(1); }
const agent = privateKeyToAccount(agentEnv.PRIVATE_KEY);
const AGENT_URL = (agentEnv.ERC8183_AGENT_URL || 'https://mizan.greateck.com/erc8183').replace(/\/$/, '');

const buyerFile = join(ROOT, 'data/buyer.env');
let buyerEnv = readEnv(buyerFile);
if (!buyerEnv.BUYER_KEY) {
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  buyerEnv = { BUYER_KEY: generatePrivateKey() };
  writeFileSync(buyerFile, `# throwaway TESTNET buyer for hire-test.mjs - never fund with real assets\nBUYER_KEY=${buyerEnv.BUYER_KEY}\n`);
}
const buyer = privateKeyToAccount(buyerEnv.BUYER_KEY);

const pub = createPublicClient({ chain: bscTestnet, transport: http(RPC) });
const wal = acct => createWalletClient({ chain: bscTestnet, transport: http(RPC), account: acct });
const send = async (label, acct, req) => {
  const hash = await wal(acct).writeContract(req);
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${rc.status === 'success' ? 'ok ' : 'FAIL'} ${label.padEnd(12)} ${TX(hash)}`);
  if (rc.status !== 'success') throw new Error(`${label} reverted`);
  return rc;
};
const getJob = async id => {
  const j = await pub.readContract({ address: A.commerce, abi: ABI.commerce, functionName: 'getJob', args: [BigInt(id)] });
  return { ...j, status: STATUS[Number(j.status)] ?? String(j.status) };
};

// Canonical job description: byte-identical to the Python SDK's build_job_description
// (json.dumps sort_keys, compact separators, ensure_ascii). The provider re-verifies it.
const clean = s => { let o = ''; for (const ch of String(s ?? '').replace(/\[/g, '(').replace(/\]/g, ')')) { const c = ch.codePointAt(0); if (c >= 0x20 || ch === '\t' || ch === '\n') o += ch; } return o; };
const pyDumps = v => { const s = x => Array.isArray(x) ? x.map(s) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, s(x[k])])) : x; return JSON.stringify(s(v)).replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')); };
function buildDescription(neg) {
  const res = neg.response ?? {}, req = neg.request ?? {}, rt = res.terms ?? {};
  if (!res.accepted) throw new Error('negotiation not accepted: ' + JSON.stringify(res).slice(0, 300));
  const terms = { deliverables: clean(rt.deliverables), quality_standards: clean(rt.quality_standards) };
  if (rt.success_criteria) terms.success_criteria = rt.success_criteria.map(clean);
  const c = { version: 1, negotiated_at: neg.negotiated_at ?? res.negotiated_at ?? Math.floor(Date.now() / 1000), task: clean(req.task_description), terms, price: rt.price ?? '', currency: rt.currency ?? '' };
  const q = neg.quote_expires_at ?? res.quote_expires_at; if (q != null) c.quote_expires_at = q;
  if (neg.chain_id != null) c.chain_id = neg.chain_id;
  if (neg.verifying_contract) c.verifying_contract = getAddress(neg.verifying_contract);
  if (neg.negotiation_hash) c.negotiation_hash = neg.negotiation_hash;
  if (neg.provider_sig) c.provider_sig = neg.provider_sig;
  const d = pyDumps(c);
  if (d.length > 2048) throw new Error('description > 2048 bytes');
  return { description: d, price: String(rt.price ?? '0') };
}

async function ensureFunds(budget) {
  const MIN_GAS = parseEther('0.002');
  let gas = await pub.getBalance({ address: buyer.address });
  if (gas < MIN_GAS) {
    const agentBal = await pub.getBalance({ address: agent.address });
    const amt = parseEther('0.003');
    if (agentBal < amt + parseEther('0.001')) throw new Error(`buyer ${buyer.address} needs ~0.003 tBNB (agent wallet too low to top up: ${formatUnits(agentBal, 18)})`);
    const hash = await wal(agent).sendTransaction({ to: buyer.address, value: amt });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  ok  gas top-up  0.003 tBNB agent -> buyer  ${TX(hash)}`);
  }
  const bal = await pub.readContract({ address: A.token, abi: ABI.erc20, functionName: 'balanceOf', args: [buyer.address] });
  if (bal < budget) {
    try {
      const hash = await wal(buyer).sendTransaction({ to: A.faucet, data: '0x359cf2b7' }); // requestTokens()
      const rc = await pub.waitForTransactionReceipt({ hash });
      console.log(`  ${rc.status === 'success' ? 'ok ' : 'FAIL'} $U faucet    ${TX(hash)}`);
    } catch (e) { console.log('  $U faucet failed (30-min cooldown?):', String(e.shortMessage || e.message).slice(0, 120)); }
  }
}

const cmd = process.argv[2] || 'hire';
if (cmd === 'status' || cmd === 'settle') {
  const id = process.argv[3]; if (!id) { console.log(`usage: ${cmd} <jobId>`); process.exit(1); }
  if (cmd === 'settle') await send('settle', buyer, { address: A.router, abi: ABI.router, functionName: 'settle', args: [BigInt(id), '0x'] });
  const j = await getJob(id);
  console.log(`job ${id}: ${j.status}  provider ${j.provider}  budget ${formatUnits(j.budget, 18)} $U`);
  process.exit(0);
}

const task = process.argv.slice(3).join(' ') || 'GOOGL 10000';
console.log(`== Hire Mizan on BSC testnet ==\nbuyer  ${buyer.address}\nagent  ${agent.address} (agentId 2503)\ntask   "${task}"\n`);

console.log('1. negotiate (off-chain, provider-signed quote)');
const r = await fetch(`${AGENT_URL}/negotiate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  task_description: task,
  terms: { deliverables: 'Best-execution report (JSON): real cost vs fair for every issuer on both Binance channels, the fairest route, and what to avoid', quality_standards: 'Built from the live Mizan index at execution time' },
}) });
if (!r.ok) { console.log(`  negotiate HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
const { description, price } = buildDescription(await r.json());
const budget = BigInt(price) > 0n ? BigInt(price) : parseUnits('1', 18); // agent is free; escrow 1 $U anyway to exercise the full flow
console.log(`  ok  agent price ${formatUnits(BigInt(price), 18)} $U; escrowing ${formatUnits(budget, 18)} $U`);

console.log('2. fund the buyer (testnet only)');
await ensureFunds(budget);

console.log('3. on-chain job');
const window = await pub.readContract({ address: A.policy, abi: ABI.policy, functionName: 'disputeWindow' });
const expiredAt = BigInt(Math.floor(Date.now() / 1000)) + window + 48n * 3600n;
const rc = await send('createJob', buyer, { address: A.commerce, abi: ABI.commerce, functionName: 'createJob', args: [agent.address, A.router, expiredAt, description, A.router] });
const log = rc.logs.find(l => l.address.toLowerCase() === A.commerce.toLowerCase());
const jobId = BigInt(log.topics[1]);
console.log(`  jobId ${jobId}`);
await send('registerJob', buyer, { address: A.router, abi: ABI.router, functionName: 'registerJob', args: [jobId, A.policy] });
await send('setBudget', buyer, { address: A.commerce, abi: ABI.commerce, functionName: 'setBudget', args: [jobId, budget, '0x'] });
await send('approve', buyer, { address: A.token, abi: ABI.erc20, functionName: 'approve', args: [A.commerce, budget] });
await send('fund', buyer, { address: A.commerce, abi: ABI.commerce, functionName: 'fund', args: [jobId, budget, '0x'] });
appendFileSync(join(ROOT, 'data/hires.jsonl'), JSON.stringify({ at: new Date().toISOString(), network: 'testnet', jobId: String(jobId), task, budget: formatUnits(budget, 18) }) + '\n');

console.log('4. waiting for Mizan to pick up the job and submit its report (usually under 2 min)...');
const t0 = Date.now(); let j;
for (;;) {
  j = await getJob(jobId);
  if (!['OPEN', 'FUNDED'].includes(j.status)) break;
  if (Date.now() - t0 > 15 * 60e3) { console.log(`  still ${j.status} after 15 min. Check: remote.bat logs router   then: hire-test.bat status ${jobId}`); process.exit(1); }
  await new Promise(res => setTimeout(res, 15e3));
  process.stdout.write('.');
}
console.log(`\n  job ${jobId}: ${j.status} after ${Math.round((Date.now() - t0) / 1000)}s  (deliverable hash ${j.deliverable})`);
try {
  const d = await (await fetch(`${AGENT_URL}/job/${jobId}/response`)).json();
  const body = d?.response?.content ?? d?.response_content ?? (typeof d?.response === 'string' ? d.response : null);
  let rep = null; try { rep = JSON.parse(body); } catch {}
  console.log('\n5. report (delivered on-chain; full JSON at ' + `${AGENT_URL}/job/${jobId}/response)`);
  if (!rep) { console.log(JSON.stringify(d, null, 2).slice(0, 2500)); }
  else {
    console.log(`  ${rep.ticker} $${rep.usd}  Shariah: ${rep.shariah || 'no'}`);
    for (const o of rep.options || []) {
      const f = x => x == null ? '   n/a ' : (x > 1000 ? '>1000%' : (x > 0 ? '+' : '') + x.toFixed(2) + '%').padStart(8);
      console.log(`  ${o.symbol.padEnd(9)} ${o.issuer.padEnd(8)} Web3 API ${f(o.web3ApiCostPct)}   Agentic Wallet ${f(o.agenticWalletCostPct)}${o.flags?.length ? '   ! ' + o.flags.join('; ') : ''}`);
    }
    console.log('\n  VERDICT: ' + rep.verdict);
  }
} catch (e) { console.log('  could not fetch report:', e.message); }
console.log(`\nTo release the escrow to the agent after the dispute window (~${Number(window) / 60} min):  hire-test.bat settle ${jobId}`);
