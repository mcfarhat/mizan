# Developer Experience journal (raw notes, feeds the DX report)

Raw, timestamped notes on every snag, with latency figures and doc page references. The final DX report is written from these notes **by hand**; organizers reject reports that read as AI-generated.

Sections the report must cover: onboarding time · doc issues (page + location) · API pitfalls · AI stack (Wallet Skills / Agentic Wallet / CLI) · tokenized-stock specifics (liquidity, slippage, off-hours, on-chain vs reference gap, bStocks/Ondo/xStocks differences) · redesign ideas · missing capabilities.

## 2026-09-25
- Researched the docs. RWA endpoint parameter docs (`/market/rwa/*`) are cut off or incomplete on the Market API page; could not confirm field names for reference price or session flags.
- The `binance-tokenized-securities-info` skill documents Ondo data only. Unclear whether bStocks and xStocks are covered by the RWA endpoints and RFQ vendors.
- The tokenized-stock buy flow is RFQ (quote → swap returns EIP-712 typedData → sign → `order/submit` → poll). This is a separate path from a plain swap and easy to miss.
- No npm package `@binance/wallet-skills` exists (third-party projects reference it); skills install via `npx skills add`.
- Unclear whether the Agentic Wallet alone counts as "a Binance Web3 API module" for eligibility.
- API key onboarding: _(fill in: start time → first successful call, blockers)_
- 01:52 (Beirut) · API key creation (dev portal): the permission list shows "B402 Payments" as a checkbox next to Trade/Market/Wallet, but ticking it opens a full **merchant application** (payout wallet, business name, category, email, website URL). No hint beforehand that it's an application rather than a permission, or that it may need review. Unticked it and created the key without B402; will apply later once the Mizan site is live.

## 2026-09-25 · first live probe (NVDA, US premarket, 08:26 UTC)
- First successful signed Web3 API call worked on the first try: HMAC scheme as documented. Latencies were about 320–590 ms, except `rwa/platforms` at **2.5 s**.
- `rwa/platforms` lists only **ondo** (458 BSC tokens) and **bstock** (80). **xStocks is not listed as an RWA platform**, yet the aggregator's error message says "RFQ (xStock) quote", so xStocks *is* routable. The two surfaces disagree.
- `POST /market/rwa/price` returns `"Request method 'POST' not supported"` wrapped in an HTTP **200** with a different envelope (`status/type/code/errorData`) than the documented `OCResult {code,msg,data}`. Two envelope shapes on one API makes generic error handling harder.
- `aggregator/quote` for Ondo and xStock fails with `40001 userWalletAddress is required for RFQ` even for a *price discovery* quote. It's an optional parameter in the docs, but you can't learn it's required until you try. bStocks quotes fine without a wallet (execution mode SWAP via LiquidMesh → "Metric" DEX).
- **The three wrappers use three different execution paths:** Ondo = RFQ, xStock = RFQ, bStocks = AMM swap. A single "buy NVDA" button hides very different mechanics (EIP-712 order vs on-chain swap).
- `market/price` for **NVDAx returned a price timestamped ~24 h old** (`time` 1790236702000) while Ondo and bStocks were seconds old. There's no staleness flag, so you only notice by reading `time`.
- The public bapi `rwa/stock/detail/list/ai?type=1` = Ondo only. bStocks and xStocks addresses aren't in it, and `type` isn't documented. The `dynamic` endpoint returns `type: 3` for bStocks.
- Multipliers differ per wrapper for the same stock (NVDA: Ondo 1.00172, bStocks 1.00078, xStocks 1.00092) because they reinvest dividends differently. Comparing raw token prices across wrappers is wrong without multiplier normalization, and nothing in the API docs points this out.
- `market/status` response: `nextClose` (13:29Z) comes *before* `nextOpen` (13:31Z) during premarket. That's the 2-min session-change pause, but it reads like a bug without explanation.
- xStocks primary market has **$1,000 min order** (`limitsPerPeriod.market.minOrderFiatValue`). Secondary via aggregator may differ; to check.
- Not Binance: Pyth Hermes now returns **401 unauthorized** without a key (it used to be open). Dropped it; using Binance `stockInfo.price` as the reference instead.
- xStocks public API `/multiplier` requires a `network` query param that the docs page doesn't mention (400 Validation error).

## 2026-09-25 · probe v2 (08:36 UTC, premarket)
- **Headline finding: a $10k USDT → NVDAon aggregator quote returned 29.906 tokens, an effective $334.38/token vs fair ≈ $226.35 (≈ +47.7% overpay), while the same quote reported `priceImpactPercent: 0.328`.** Route: PancakeSwap V3 66.8% / Metric 32% / "Rfq Halfmoon" 1.2%, flagged `isBest: true`. $100 and $1k quotes were within 0.08% of fair. Either `priceImpactPercent` means something other than price impact, or the field is badly wrong. An agent trusting it would lose ~$3.2k on a $10k buy. (To re-verify on more runs.)
- With a `userWalletAddress` supplied, the Ondo quote came back as **SWAP via LiquidMesh**, not RFQ. So the "RFQ required" error earlier was about validation, not the route that actually wins. RFQ liquidity appears only as a 1.2% slice ("Rfq Halfmoon").
- **xStocks NVDAx: "Insufficient liquidity for a quote" (40374) even at $100**; its `market/price` is ~24 h stale (2026-09-24T07:58Z). The token exists and is in Binance's list, but it can't be bought through the aggregator at all.
- `GET /market/rwa/price` wants **`tokenContractAddresses`** (plural). The error only appears after you switch from POST (which the docs suggest) to GET. The singular form used by every other endpoint fails.
- The bapi list `type` param isn't documented: 1 = Ondo (1366 rows, multi-chain), 2 = xStocks (267), 3 = bStocks (80), 4 = 4 rows ("xKLSH"...). Found by trial.
- xStocks multiplier API rejects `bsc` and "Binance Smart Chain"; the enum wants `BinanceSmartChain`. The xStocks list says multiplier "1" while `dynamic` says 1.00092 for the same token. The sources disagree.

## 2026-09-25 · first full collector pass (08:44 UTC, premarket, 9 tickers × 3 wrappers × 3 sizes, 106 calls, 0 non-200, 51 s)
- **Mispriced "best" quote reproduced on a second ticker:** \$10k USDT → GOOGLon returned 6.90 tokens = \$1,448/token vs fair \$344 (**+321%**), with \`priceImpactPercent: 0.76\` and \`isBest\`. Route: PancakeSwap V3 77.3% / Uniswap V4 22.7%. NVDAon \$10k again ≈ +47%. Both are Ondo tokens routed through AMM pools instead of Ondo's RFQ liquidity. The API's own impact figure understates the real cost by 60–400×.
- **xStocks is effectively untradeable via the aggregator on BSC:** every xStock (NVDA, AAPL, MSFT, GOOGL, TSLA, META, AMZN, SPY, QQQ) returns "Insufficient liquidity" even at \$100. Their \`market/price\` ages run from 37 min (SPYx) to **29.5 days (METAx, −26% vs fair)**. These stale prices are served with no staleness flag.
- bStocks: \`dynamic.stockInfo.price\` is **null** (Ondo's is populated for the same ticker), so the underlying reference has to be borrowed from another wrapper. The field is inconsistent across providers.
- Universe from official lists: 512 BSC tickers; 117 exist in ≥2 wrappers; 37 in all three (AAPL AMD AMZN ASML ASTS AVGO BMNR COIN CRCL CRM CRWD EWY GME GOOGL GS HIMS HOOD IBM INTC IREN META MRVL MSFT MSTR MU NFLX NVDA ORCL PLTR PYPL QQQ SOXL SPCX SPY TQQQ TSLA TSM).

## 2026-09-25 · 2 h of collection (08:43–10:53 UTC, 26 passes, premarket)
- Trap persistence: **GOOGLon @ $10k trapped in 26/26 passes (median +329%)**, **NVDAon @ $10k in 25/26 (median +176%, max +205%)**. bStocks stayed ≤ 0.5% for all 8 of its tickers at every size up to $10k. The Ondo trap is systematic, not a one-off glitch.
- One pass hit a single non-200 and took 126 s instead of about 55 s. Latency spikes happen but are rare.
