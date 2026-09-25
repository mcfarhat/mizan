// Public Binance "bapi" RWA endpoints used by the binance-tokenized-securities-info skill (no key)
import { timedFetch } from './http.mjs';
const B = 'https://www.binance.com/bapi/defi';
const W = '/public/wallet-direct/buw/wallet';
const H = { 'Accept-Encoding': 'identity', 'User-Agent': 'binance-web3/1.1 (Skill)' };
const get = (label, path) => timedFetch(label, B + path, { headers: H });

export const stockList = (type = 1) => get('bapi/stock-list', `/v1${W}/market/token/rwa/stock/detail/list/ai?type=${type}`);
export const marketStatus = () => get('bapi/market-status', `/v1${W}/market/token/rwa/market/status/ai`);
export const assetStatus = (a) => get('bapi/asset-status', `/v1${W}/market/token/rwa/asset/market/status/ai?chainId=56&contractAddress=${a}`);
export const dynamic = (a) => get('bapi/dynamic', `/v2${W}/market/token/rwa/dynamic/ai?chainId=56&contractAddress=${a}`);
export const meta = (a) => get('bapi/meta', `/v1${W}/market/token/rwa/meta/ai?chainId=56&contractAddress=${a}`);
