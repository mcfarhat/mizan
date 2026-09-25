// Binance Web3 API client (https://web3.binance.com/en/dev-docs/authentication)
// sign = Base64(HMAC-SHA256(timestamp + METHOD + requestPath(incl /build + query) + body, secret))
import { createHmac } from 'node:crypto';
import { env } from './env.mjs';
import { timedFetch } from './http.mjs';

const BASE = 'https://web3.binance.com';
const PREFIX = '/build';

export function hasKey() { return !!(env.WEB3_API_KEY && env.WEB3_API_SECRET); }

export async function web3(label, method, path, { query, body } = {}) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const requestPath = PREFIX + path + qs;
  const bodyStr = body ? JSON.stringify(body) : '';
  const ts = new Date().toISOString();
  const sign = createHmac('sha256', env.WEB3_API_SECRET || '')
    .update(ts + method.toUpperCase() + requestPath + bodyStr).digest('base64');
  return timedFetch(label, BASE + requestPath, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-OC-APIKEY': env.WEB3_API_KEY || '',
      'X-OC-TIMESTAMP': ts,
      'X-OC-SIGN': sign,
    },
    body: bodyStr || undefined,
  });
}

// --- Market / RWA ---
export const rwaPlatforms = () => web3('rwa/platforms', 'GET', '/api/v1/dex/market/rwa/platforms');
export const rwaTokens = (query = {}) => web3('rwa/tokens', 'GET', '/api/v1/dex/market/rwa/tokens', { query });
export const rwaPrice = (addrs) => web3('rwa/price', 'POST', '/api/v1/dex/market/rwa/price',
  { body: addrs.map(a => ({ binanceChainId: '56', tokenContractAddress: a })) });
export const marketPrice = (addrs) => web3('market/price', 'POST', '/api/v1/dex/market/price',
  { body: addrs.map(a => ({ binanceChainId: '56', tokenContractAddress: a })) });

// --- Trading (aggregator) ---
export const quote = ({ from, to, amount, wallet, slippagePercent }) =>
  web3('aggregator/quote', 'GET', '/api/v1/dex/aggregator/quote', {
    query: Object.fromEntries(Object.entries({
      binanceChainId: '56', amount, fromTokenAddress: from, toTokenAddress: to,
      userWalletAddress: wallet, slippagePercent,
    }).filter(([, v]) => v !== undefined && v !== '')),
  });
