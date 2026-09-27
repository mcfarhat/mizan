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

## 2026-09-25 · Agentic Wallet onboarding
- 14:41 (Beirut) · The Agentic Wallet quickstart says "MPC Wallet created in the Binance App" is a prerequisite but gives **no navigation**. Third-party guides say "Wallet tab" or "Exchange/Wallet toggle", and neither exists in the current app (bottom tabs show "Assets"). The wallet entry was actually on the **Home** tab. It took some hunting; one screenshot or menu path in the quickstart would have saved the time.
- 14:50 · `baw auth signin` showed a pairing code in the app and completed the login by itself ("✓ Login successful! Wallet created"). The documented next step `baw auth verify` then failed with `required option '--qrCodeId <id>' not specified`. The SKILL.md presents signin → verify as the flow, but verify is unnecessary here and needs an ID the signin output never showed.
- The in-app pairing request is labelled with a city ("Beirut") but shows nothing tying it to the CLI session. Only the pairing code does that, and nothing tells you to compare the two.
- `wallet settings`: `dailyLimit: 50000`, `defiDailyLimit: 5000`, `x402DailyLimit: 20` with **no units**. Is it USD, cents, or something else? If it's USD, the default daily cap is $50,000, far above the docs' "$50 starter" suggestion.
- Session: `maxSigninDuration 48h`, `inactiveSignoutDuration 48h`, `signInMaxTime` 7 days out. A fully autonomous DCA agent needs a human to re-approve on the phone every ≤ 48 h. That's a sensible safety choice, but it limits "set and forget" agents and deserves a mention in the docs.
- The same EVM address is used across BSC, ETH, Base, Arbitrum, Polygon and Robinhood Chain.
- 14:55 · The units are confirmed as USD: the default daily limit is **$50,000**. The app only offers $1k / $5k / $10k / $50k, so the "$50 daily limit" the quickstart recommends **cannot be set**. The lowest is $1k. The real protection ends up being "keep the balance small", not the limit. Set it to $1k.
- Max sign-in is adjustable in the app (set to 7 days). The token scope options are "Binance-listed, Alpha, major Launchpad, community-verified" vs "all tokens". It isn't stated whether tokenized stocks (bStocks / Ondo / xStocks) count as "Binance-listed" under the limited scope.
- DeFi and prediction daily limits default to $5k each even for a user who never enabled those features. x402 payment limit $20/day.
- 15:03 · The agentic-wallet SKILL.md shows `market-order quote --fromToken --toToken --amount`, but the actual CLI (v1.10.0) requires **`--fromTokenQty`** and **`--binanceChainId`**. The SKILL.md examples fail as written. Found by reading `dist/index.js`.
- 15:46 · `baw market-order quote --json` returns `fromCoinAmount` / `toCoinAmount` (human units, "Coin"), while the Web3 REST API returns `fromTokenAmount` / `toTokenAmount` (wei, "Token"). Same product, two naming schemes and two unit conventions. The CLI quote also omits the route, vendor, execution mode and price impact that the REST quote includes, so an agent using only the Agentic Wallet can't tell *how* it will be filled.

## 2026-09-25 · first real trade (Agentic Wallet)
- 12:51 UTC · $5 USDT → NVDAB via `baw market-order swap`, order 26092500001915257995, tx 0xb1bcf919af80bba7d1843f8bb240b46b38cf5bb707eca201a11b2aa8da7be11c. Confirmed in about 1 s. Two txs: an **exact-amount approve** (5 USDT, not unlimited, which is good security practice) and then the swap.
- Received 0.022188560 NVDAB → effective $225.34 vs fair $225.46 = **−0.05%** (below fair). Mizan index predicted +0.001%, live quote −0.070%. **Realized was within 0.02% of the quote.** Gas ≈ 0.0000702 BNB (swap) + approve, a few cents total.
- `market-order list --orderId <id>` returns `{"total":0,"list":[]}` for the exact orderId that `swap` just returned, while the unfiltered list shows it FINISHED. **The ID filter doesn't work.**
- The market-order record has status and txHash but **no filled amount**. You have to diff wallet balances or decode the tx to learn what you actually got. For an agent that verifies its own fills, this is the most important missing field.
- `swap` returns only `{orderId}`, with no txHash, no expected output and no status. The agent has to poll a different endpoint, and that endpoint's filter is broken (above).

## 2026-09-25 · first basket run
- 16:11 · `baw market-order quote` for **$2.40 NVDAon and $1.80 MSFTon** failed with `315008 SERVICE_ERROR "From token value greater than 5 USD"`, while $1.80 GOOGLB (bStocks) quoted and filled fine (realized +0.056% vs fair). So **Ondo tokens have a $5 minimum order via the Agentic Wallet**, and the error message states the rule **backwards**: the value was *less* than $5. Nothing in the docs mentions a per-issuer minimum. The executor now skips Ondo under $5 and falls back to the next-fairest wrapper.

## 2026-09-25 · CORRECTION (evening): \`priceImpactPercent\` is a fraction, not a percent
- Earlier entries above said the aggregator "reported under 1% impact" on the +47% / +329% Ondo quotes. **That was our misreading.** Cross-checking all 2,530 over-fair quotes collected so far: \`priceImpactPercent\` equals the realized value loss **as a fraction** (0.76 → 76%), median deviation 0.06 pp. The API was honest; we took the name at face value.
- The DX finding is the **naming**: a field called \`...Percent\` that holds a 0–1 fraction. We, a careful integrator, misread it for a full day; an autonomous agent will too. Suggest renaming it (\`priceImpactRatio\`) or returning percent, and documenting the unit.
- What stands: (1) the aggregator marks routes that lose 30–99% of value as \`isBest\` and would execute them (Ondo tokens at ≥\$5k–\$10k, and some at \$1k after hours, e.g. MSFTon \$1k → 0.00000097 tokens); (2) **the Agentic Wallet CLI quote exposes no price impact at all**, so an agent using only the wallet cannot see this.

## 2026-09-25 ~21:00 UTC · Two Binance routing engines disagree by ~370 points
- **Same token, same minute, same wallet address.** Web3 REST `aggregator/quote` (server collector, userWalletAddress = our Agentic Wallet) at 20:59:45Z: $10k USDT → GOOGLon = **+369% over fair** (route PancakeSwap V3 / Uniswap V4, `isBest`). **Agentic Wallet** `baw market-order quote` at 21:00:12Z: $10k → GOOGLon = **−0.14%** (29.03 tokens).
- Wallet quotes at 21:00Z, all fair: GOOGLon $10k −0.14%, NVDAon $10k −0.11%, MSFTon $1k −0.44% / $10k −0.45%, and bStocks at −0.05% to +0.04%. At the same time REST gave MSFTon $1k → ~0 tokens (>1000%) and NVDAon $10k ~+190%.
- So the public Web3 API (the module this hackathon requires) and Binance's own Agentic Wallet do **not** reach the same liquidity. The wallet evidently reaches Ondo's liquidity; the REST "best" route doesn't, at least by default. Nothing in the docs says the engines differ. Builders on the REST API get routes that lose most of an order's value; wallet users get fair prices.
- Consequence for Mizan: best execution depends on **channel** as well as issuer. Next: probe REST vendor params (engines.mjs) to see whether the fair route is reachable from the API.
- 21:08Z · engines.mjs, GOOGLon $10k, same wallet address, same minute:
  - REST default (LiquidMesh): 6.18 tokens, **+369%**
  - REST vendor=Pancake: 8.06 tokens, +260%
  - REST vendor=LiquidMesh: same as default
  - REST without a wallet address: `40001 userWalletAddress is required for RFQ (Ondo) quote`
  - **Agentic Wallet: 29.04 tokens, −0.19%**
- **Across 6,666 Ondo quotes collected via the REST aggregator, `executionMode` was SWAP every time. Not once RFQ.** The docs describe an RFQ flow for tokenized stocks (quote → EIP-712 → order/submit), and the API *demands* a wallet address "for RFQ (Ondo)", but it never actually serves an RFQ route. As far as an API integrator can tell, Ondo's own liquidity is reachable only through the Agentic Wallet. No documented vendor value unlocks it.
- Agentic Wallet on a headless server: plain `baw auth signin` prints "Opening login page in browser..." and **silently succeeds at opening nothing** (no display over SSH), printing only a QR code ID, with no URL and no QR. The URL only appears if opening the browser *throws*. The working path is `baw auth signin --json` (returns `urlForWeb`, `qrCodeId`, `pairingCode`) followed by `baw auth verify --qrCodeId …`. That also explains the earlier "verify needs --qrCodeId" confusion: verify belongs to this async flow, which the SKILL.md presents as the default. Suggest: detect no-display and print the URL, or document the headless flow.
- **One session per Agentic Wallet.** Signing the same wallet in on a second machine (the server) silently logged out the first (PC): the next `baw` call there returns `10003000 NOT_LOGGED_IN`. There's no warning at sign-in and no "active sessions" view. For agents that's significant: you can't run a monitoring process and a trading process on separate hosts. We moved everything wallet-related to one host.

## 2026-09-27 · Agent registered on ERC-8004 (BNB Agent Studio)
- Registered the Mizan agent's identity with `register(string agentURI)` (registration-v1 data URI, 3 services) using viem, no SDK. **BSC testnet agentId 2503** (tx 0xdf726a36…ea3cf), **BSC mainnet agentId 359180** (tx 0xf3ce4366…8bc9f). The agentId is read from the ERC-721 `Transfer` event in the receipt, since `register` returns it only on-chain.
- Testnet faucet: the official BNB Chain faucet requires the address to already hold mainnet BNB, so the agent key had to be funded on mainnet before it could get tBNB.
- The ERC-8183 provider (`bnbagent` Python SDK, `create_erc8183_app`) runs as `mizan-router` behind Caddy at `/erc8183`, next to the Node dashboard. Two runtimes on one box works, but the SDK is Python-only, so a Node project needs a Python sidecar.

## 2026-09-27 · First end-to-end hire (BSC testnet job #1362)
- Buyer-side flow with viem: negotiate (provider-signed quote) → `createJob` → `registerJob` (OptimisticPolicy) → `setBudget` → `approve` → `fund`, escrowing 1 $U from the public testnet faucet. The Mizan provider picked up the FUNDED job and submitted its report on-chain **31 seconds** after funding (deliverable hash 0xbef8aa3d…82a9). The report for "GOOGL 10000" was: buy GOOGLon via the Agentic Wallet (−0.26%), or GOOGLB (≈0%); avoid GOOGLon via the Web3 API aggregator (+366.9%).
- The provider's price is 0, yet a job still needs a nonzero escrow to exercise the full lifecycle, and the buyer needs a testnet $U faucet (`requestTokens()`, 10 $U / 30 min). None of this is in the SDK quickstart.
- There is no buyer SDK: the Python `bnbagent` SDK is provider-only. The buyer has to port `build_job_description` byte for byte (sorted-key JSON, `ensure_ascii`, `[`→`(`), or the provider rejects the job. That's the biggest DX trap for anyone hiring an agent from JS.
- `GET /erc8183/job/{id}/verify` returns `wrong_status` once a job is SUBMITTED ("expected FUNDED"). It is a pre-work check for providers, not a buyer-facing "verify the deliverable" endpoint as the name suggests.
- The response envelope nests the report as a JSON string inside `response.content` with `content_type: text/plain`, so buyers must double-parse it.
