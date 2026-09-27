// One integrity snapshot for one ticker across its wrappers (Ondo / bStocks / xStocks).
// fair price = underlying stock price x wrapper's shares multiplier
import * as bapi from './bapi.mjs';
import * as w3 from './web3api.mjs';
import { env } from './env.mjs';

export const USDT = '0x55d398326f99059fF775485246999027B3197955';
export const SIZES = [100, 1000, 5000, 10000, 25000, 50000];
export const SAFE_PCT = 0.5; // 'safe size' = largest ladder size whose real cost stays within this % of fair
export const WRAPPERS = ['ondo', 'bstocks', 'xstocks'];
// RFQ quotes require userWalletAddress; quoting is read-only.
const QUOTE_WALLET = () => env.WALLET_ADDRESS || '0x0D5fc8904322FBFDa2Ea5D5B739891de9e75dDe4';
const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
const pct = (a, b) => (a != null && b ? (a / b - 1) * 100 : null);

export async function snapshotTicker(ticker, addrs, { session, marketPrices } = {}, sizes = SIZES) {
  const at = new Date().toISOString();
  const rows = [];
  // Fetch all wrappers' dynamic data first: bStocks returns stockInfo.price = null, so the
  // underlying reference price is shared across wrappers of the same ticker.
  const dyn = {};
  for (const w of WRAPPERS) if (addrs[w]) dyn[w] = (await bapi.dynamic(addrs[w])).body?.data || {};
  const refStock = WRAPPERS.map(w => num(dyn[w]?.stockInfo?.price)).find(x => x);
  for (const w of WRAPPERS) {
    const addr = addrs[w];
    if (!addr) continue;
    const d = dyn[w];
    const stock = num(d.stockInfo?.price) ?? refStock ?? null;
    const mult = num(d.tokenInfo?.sharesMultiplier) ?? 1;
    const onchain = num(d.tokenInfo?.price);
    const mp = marketPrices?.[addr.toLowerCase()];
    const row = {
      at, ticker, wrapper: w, symbol: d.symbol, addr,
      session: session ?? null, status: d.statusInfo?.reasonCode ?? null,
      stock, mult, fair: stock ? stock * mult : null, onchain,
      premiumPct: null, priceAgeSec: mp ? Math.round((Date.now() - mp.time) / 1000) : null,
      holders: num(d.tokenInfo?.totalHolders), vol24h: num(d.tokenInfo?.volume24h),
      quotes: {},
    };
    row.premiumPct = pct(onchain, row.fair);
    if (w3.hasKey()) {
      let dead = false;
      for (const usd of sizes) {
        if (dead) { row.quotes[usd] = { err: 'skipped', msg: 'no liquidity at smaller size' }; continue; }
        const q = await w3.quote({ from: USDT, to: addr, amount: (BigInt(usd) * 10n ** 18n).toString(), wallet: QUOTE_WALLET() });
        const list = Array.isArray(q.body?.data) ? q.body.data : [];
        const best = list.find(x => x.isBest) || list[0];
        if (!best) { row.quotes[usd] = { err: q.body?.code ?? q.status, msg: q.body?.msg ?? q.err, ms: q.ms }; if (q.body?.code === 40374) dead = true; continue; }
        const tokens = Number(best.toTokenAmount) / 10 ** Number(best.toToken?.decimal || 18);
        const eff = usd / tokens;
        row.quotes[usd] = {
          mode: best.executionMode, vendor: best.vendorName,
          route: (best.dexRouterList || []).map(r => `${r.dexProtocol?.dexName}:${r.dexProtocol?.percent}`).join('|'),
          tokens, effPrice: eff,
          costVsFairPct: pct(eff, row.fair),                 // what you actually pay over fair value
          reportedImpactPct: num(best.priceImpactPercent),   // what the API claims
          ms: q.ms,
        };
      }
    }
        // safe size = largest contiguous ladder size within SAFE_PCT (stop at first breach)
    let safe = 0; for (const u of sizes) { const c = row.quotes[u]?.costVsFairPct; if (c != null && c <= SAFE_PCT) safe = u; else if (safe || c == null) break; }   // small-size misses (fixed fees) don't end the scan
    row.safeSizeUsd = row.quotes[sizes[0]]?.costVsFairPct == null ? null : safe;
    row.tier = addrs.tier || 'core';
    rows.push(row);
  }
  return rows;
}

export async function marketContext(allAddrs) {
  const s = (await bapi.marketStatus()).body?.data;
  const session = s ? (s.openState ? (s.marketStatus || 'open') : 'closed') + (s.offhours?.openState ? '+offhours' : '') : null;
  const marketPrices = {};
  if (w3.hasKey()) {
    for (let i = 0; i < allAddrs.length; i += 100) {
      const r = await w3.marketPrice(allAddrs.slice(i, i + 100));
      for (const x of r.body?.data || []) marketPrices[x.tokenContractAddress.toLowerCase()] = { price: Number(x.price), time: x.time };
    }
  }
  return { session, marketPrices };
}
