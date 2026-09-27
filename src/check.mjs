// Best-execution check for one trade: every issuer x both Binance channels, the fairest route,
// what to avoid, and a go/no-go against a max-cost guard. Used by /api/check, the dashboard's
// "Check my trade" box and the Agentic Wallet skill (skill/mizan-guard).
const CHANNEL = { api: 'Web3 API aggregator', wallet: 'Binance Agentic Wallet' };
const pick = (sizes, usd) => sizes.find(s => s >= usd) ?? sizes.at(-1) ?? null;
const fmt = (c) => c > 1000 ? '>1000%' : `${c > 0 ? '+' : ''}${c.toFixed(2)}%`;

export function check(index, ticker, usd, { maxCostPct = 1, channel = 'any' } = {}) {
  const t = index.tickers.find(x => x.ticker === ticker);
  if (!t) return { ok: false, error: `unknown ticker ${ticker}`, known: index.tickers.map(x => x.ticker) };
  const options = t.wrappers.map(w => {
    const apiSizes = Object.keys(w.quotes || {}).map(Number).filter(s => w.quotes[s]).sort((a, b) => a - b);   // incl. failed quotes
    const walSizes = Object.keys(w.wallet || {}).map(Number).sort((a, b) => a - b);
    const as = pick(apiSizes, usd), ws = pick(walSizes, usd);
    return {
      symbol: w.symbol, issuer: w.wrapper, token: w.addr, fairPriceUsd: w.fair ?? null, sharesMultiplier: w.mult ?? null,
      web3Api: as == null ? null : w.quotes[as].costVsFairPct == null ? { noLiquidity: true, measuredAtUsd: as, at: w.at }
        : { costVsFairPct: w.quotes[as].costVsFairPct, measuredAtUsd: as, at: w.at },
      agenticWallet: ws == null ? null : { costVsFairPct: w.wallet[ws].costVsFairPct, measuredAtUsd: ws, at: w.wallet[ws].at },
      flags: (w.flags || []).map(f => f.txt),
    };
  });
  const routes = [];
  for (const o of options) {
    if (o.web3Api && !o.web3Api.noLiquidity && channel !== 'wallet') routes.push({ symbol: o.symbol, issuer: o.issuer, token: o.token, channel: 'api', channelName: CHANNEL.api, ...o.web3Api });
    if (o.agenticWallet && channel !== 'api') routes.push({ symbol: o.symbol, issuer: o.issuer, token: o.token, channel: 'wallet', channelName: CHANNEL.wallet, ...o.agenticWallet });
  }
  routes.sort((a, b) => a.costVsFairPct - b.costVsFairPct);
  // Wallet channel requested but Mizan hasn't sampled wallet quotes for this stock (it samples the core tickers):
  // suggest the issuer with the fairest measured Web3 API liquidity, and require the caller to verify its own quote.
  let verifyWithOwnQuote = false;
  if (!routes.length && channel === 'wallet') {
    const proxy = options.filter(o => o.web3Api && !o.web3Api.noLiquidity).sort((a, b) => a.web3Api.costVsFairPct - b.web3Api.costVsFairPct)[0];
    if (proxy && proxy.web3Api.costVsFairPct <= maxCostPct) {
      verifyWithOwnQuote = true;
      const r = { symbol: proxy.symbol, issuer: proxy.issuer, token: proxy.token, fairPriceUsd: proxy.fairPriceUsd, channel: 'wallet', channelName: 'Binance Agentic Wallet (not yet sampled; verify your own quote)', costVsFairPct: null, proxyWeb3ApiCostPct: proxy.web3Api.costVsFairPct, measuredAtUsd: proxy.web3Api.measuredAtUsd };
      const verdict = `Mizan hasn't sampled Agentic Wallet quotes for ${ticker}. The fairest liquid issuer is ${proxy.symbol} (Web3 API ${fmt(proxy.web3Api.costVsFairPct)}). Quote it in the wallet and only buy if your quote is within ${maxCostPct}% of fair ($${(proxy.fairPriceUsd ?? 0).toFixed(4)} per token).`;
      return { ok: true, ticker, usd, maxCostPct, channel, shariah: t.shariah, go: false, verifyWithOwnQuote, verdict, best: r, noLiquidity: options.filter(o => o.web3Api?.noLiquidity).map(o => o.symbol), avoid: [], options, walletCommand: null, indexAt: t.at };
    }
  }
  const best = routes[0] || null;
  const avoid = routes.filter(r => r.costVsFairPct > maxCostPct);
  const go = !!best && best.costVsFairPct <= maxCostPct;
  const worst = avoid.at(-1);
  const dry = options.filter(o => o.web3Api?.noLiquidity).map(o => o.symbol);
  const verdict = !best ? `No measured route for ${ticker} right now. Don't trade blind.`
    : (go ? `Buy $${usd.toLocaleString('en-US')} of ${ticker} as ${best.symbol} through the ${best.channelName}: about ${fmt(best.costVsFairPct)} vs fair.`
          : `Don't buy ${ticker} right now: even the fairest route (${best.symbol} via ${best.channelName}) costs ${fmt(best.costVsFairPct)} over fair, above your ${maxCostPct}% limit.`)
      + (worst ? ` Avoid ${worst.symbol} via the ${worst.channelName} (${fmt(worst.costVsFairPct)}).` : '')
      + (dry.length && channel !== 'wallet' ? ` No liquidity on the Web3 API at this size: ${dry.join(', ')}.` : '');
  return {
    ok: true, ticker, usd, maxCostPct, channel, shariah: t.shariah, go, verifyWithOwnQuote, verdict,
    best, noLiquidity: dry, avoid: avoid.map(({ symbol, channel, costVsFairPct }) => ({ symbol, channel, costVsFairPct })),
    options,
    walletCommand: best?.channel === 'wallet' && go ? `baw market-order swap --binanceChainId 56 --fromToken USDT --toToken ${best.token} --fromTokenQty ${usd}` : null,
    method: 'fair = underlying stock price x issuer shares multiplier; cost = real quoted fill vs fair. Measured every 5 min (Web3 API) / 15 min (Agentic Wallet) by https://mizan.greateck.com',
    indexAt: t.at,
  };
}
