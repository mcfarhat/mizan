// Independent reference sources
import { timedFetch } from './http.mjs';
export const pyth = (ids) => timedFetch('pyth/hermes',
  'https://hermes.pyth.network/v2/updates/price/latest?parsed=true&' + ids.map(i => 'ids[]=' + i).join('&'));
export const xstock = (sym) => timedFetch('xstocks/asset', `https://api.xstocks.fi/api/v2/public/assets/${sym}`);
export const xstockMult = (sym, network = 'BinanceSmartChain') => timedFetch('xstocks/multiplier', `https://api.xstocks.fi/api/v2/public/assets/${sym}/multiplier?network=${encodeURIComponent(network)}`);
