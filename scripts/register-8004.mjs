// Register the Mizan agent on the ERC-8004 Identity Registry (on-chain registration-v1 JSON as a data URI).
//   node scripts/register-8004.mjs mainnet|testnet
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, http, parseAbi, parseEventLogs } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ROOT } from '../src/env.mjs';

const net = process.argv[2] === 'testnet' ? 'testnet' : 'mainnet';
const REG = { mainnet: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', testnet: '0x8004A818BFB912233c491871b3d84c89A494BD9e' }[net];
const RPC = { mainnet: 'https://bsc-dataseed.bnbchain.org', testnet: 'https://bsc-testnet-rpc.publicnode.com' }[net];
const env = Object.fromEntries(readFileSync(join(ROOT, 'agent-studio/.env'), 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
if (!/^0x[0-9a-fA-F]{64}$/.test(env.PRIVATE_KEY || '')) { console.log('No PRIVATE_KEY in agent-studio/.env: run node scripts/new-agent-key.mjs first'); process.exit(1); }
const account = privateKeyToAccount(env.PRIVATE_KEY);
const base = 'https://mizan.greateck.com';
const doc = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'Mizan Best-Execution Router',
  description: 'Best execution for tokenized stocks on BNB Chain. Measures every issuer (Ondo, bStocks, xStocks) and both Binance channels (Web3 API aggregator vs Agentic Wallet) against fair value every 5-15 min, and tells you, or buys for you, where the price is fair. Hire with task "<TICKER> <USD>" (e.g. "NVDA 5000") for a best-execution report. Shariah screen available. By Greateck.',
  image: '',
  services: [
    { name: 'ERC-8183 best-execution report', endpoint: `${base}/erc8183`, skills: ['best-execution', 'routing', 'tokenized-stocks', 'rwa'], domains: ['defi', 'rwa'] },
    { name: 'Route API (free)', endpoint: `${base}/api/route/{TICKER}?usd={USD}`, skills: ['routing'], domains: ['rwa'] },
    { name: 'Integrity index dashboard', endpoint: base, skills: ['analytics'], domains: ['rwa'] },
  ],
  registrations: [],
  supportedTrusts: ['reputation'],
  active: true,
  x402support: false,
};
const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(doc)).toString('base64');
const chain = net === 'mainnet' ? bsc : bscTestnet;
const pub = createPublicClient({ chain, transport: http(RPC) });
const wal = createWalletClient({ chain, transport: http(RPC), account });
const bal = await pub.getBalance({ address: account.address });
console.log(`== ERC-8004 register on BSC ${net} ==\nagent wallet ${account.address}  balance ${Number(bal) / 1e18} BNB`);
if (bal === 0n) { console.log('Wallet has no BNB for gas - fund it first.'); process.exit(1); }
const abi = parseAbi(['function register(string agentURI) returns (uint256 agentId)', 'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);
const hash = await wal.writeContract({ address: REG, abi, functionName: 'register', args: [uri] });
console.log('tx', hash);
const rc = await pub.waitForTransactionReceipt({ hash });
const id = parseEventLogs({ abi, logs: rc.logs, eventName: 'Transfer' })[0]?.args?.tokenId;
console.log(rc.status === 'success' ? `REGISTERED: agentId ${id}` : 'FAILED', `\nhttps://${net === 'mainnet' ? '' : 'testnet.'}bscscan.com/tx/${hash}`);
