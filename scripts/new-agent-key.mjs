// Create a fresh wallet for the Mizan agent identity and store it in agent-studio/.env (never printed in full).
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { ROOT } from '../src/env.mjs';
const envPath = join(ROOT, 'agent-studio/.env');
if (!existsSync(envPath)) copyFileSync(join(ROOT, 'agent-studio/env-template.txt'), envPath);
let env = readFileSync(envPath, 'utf8');
const cur = env.match(/^PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m)?.[1];
if (cur) { console.log('agent-studio/.env already has a key. Agent address:', privateKeyToAccount(cur).address); process.exit(0); }
const pk = '0x' + randomBytes(32).toString('hex');
const pw = randomBytes(18).toString('base64url');
env = env.replace(/^PRIVATE_KEY=.*$/m, `PRIVATE_KEY=${pk}`).replace(/^WALLET_PASSWORD=.*$/m, `WALLET_PASSWORD=${pw}`);
writeFileSync(envPath, env);
console.log('New Mizan agent wallet created and saved to agent-studio/.env (back this file up privately).');
console.log('Agent address:', privateKeyToAccount(pk).address);
console.log('Fund it with ~0.002 BNB on BSC mainnet (registration gas) and ~0.01 tBNB on BSC testnet (job gas).');
