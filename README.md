# Mizan ميزان

**Best execution for tokenized stocks on BNB Chain, plus a Shariah-screened basket agent that only buys at a fair price.**

*Mizan* is Arabic for "balance" or "scales".

- **Live dashboard:** https://mizan.greateck.com
- **Hire the agent (ERC-8183):** https://mizan.greateck.com/erc8183. BSC mainnet agentId `359180`, testnet agentId `2503`.
- **Free route API:** `https://mizan.greateck.com/api/route/GOOGL?usd=10000`

Built for **BNB Hack: Tokenized Stocks Edition** (Sep 16 – Oct 11 2026).

---

## The problem, in one trade

Buy **$10,000 of Google** on BNB Chain. There are three tokens for the same stock, and two Binance channels to buy them through. We measured the same buy, in the same minute, from the same wallet address:

| Token (issuer) | Binance Web3 API aggregator, `isBest` route | Binance Agentic Wallet |
|---|---|---|
| GOOGLon (Ondo) | **+366.9% over fair**: you receive about a fifth of the stock you paid for | **−0.26%** (slightly better than fair) |
| GOOGLB (bStocks) | ≈ 0% | −0.03% |
| GOOGLx (xStocks) | no liquidity; price 3 days old | not quotable |

The same token is almost free to buy through one Binance channel and destroys most of the order through the other. The API's route is flagged `isBest`, and it would execute.

This isn't a one-off. Mizan re-measures it every 5 to 15 minutes:

- **Ondo tokens at size, through the Web3 API:** the "best" route loses a large share of value.
  - NVDAon $5k: **+46%** median over fair
  - GOOGLon $10k: **+369%**
  - After US hours, even MSFTon $1k returned about **0 tokens**.
- **Same Ondo tokens through the Agentic Wallet:** fair, between −0.1% and −0.45%.
- **Why the channels differ, as far as we can tell:** in 6,666 Ondo quotes, the REST aggregator never returned an RFQ route (`executionMode` was always `SWAP`). The Agentic Wallet evidently reaches Ondo's own liquidity; the public API does not.
- **bStocks** stay within about 0.1–0.5% of fair on both channels.
- **xStocks** are not buyable through the aggregator on BSC, and their reference prices are often stale.

**So best execution depends on the issuer *and* the channel, and both change by size and time of day.** No existing tool shows this. Mizan measures it, publishes it, routes around it, and sells that routing to other agents.

---

## What Mizan does

### 1. Integrity index and dashboard
**Coverage:** 117 tickers that exist in two or more issuer wrappers on BSC (discovered from Binance's official RWA lists).
- **Core tickers:** NVDA, AAPL, MSFT, GOOGL, TSLA, META, AMZN, SPY and QQQ are quoted at $100, $1k, $5k, $10k, $25k and $50k every 5 minutes.
- **The rest:** quoted at $100, $1k and $10k on a rotating schedule.
- **Agentic Wallet quotes:** sampled every 15 minutes for comparison.

**The dashboard shows:**
- the real cost of each wrapper at your trade size, on both channels
- the largest size you can trade within 0.5% of fair (the "safe size")
- persistent traps, ranked by how often they recur
- history charts
- a Shariah filter

### 2. Route API (free)
`GET /api/route/:TICKER?usd=N` returns the fairest wrapper for that size, with the alternatives and their measured costs. `GET /api/index` returns the full index. Any wallet, bot or agent can check a route before trading.

### 3. Shariah-screened basket agent (Binance Agentic Wallet)
The agent takes plain-English plans such as `"$6 into halal AI every week"`, or `--no-screen` for any stocks.
- **Screen:** a ticker passes if it is held by SPUS, the SP Funds S&P 500 Sharia ETF (AAOIFI-based). 38 of the 117 tickers pass; META and AMZN are excluded.
- **Presets:** `halal-ai`, `halal-bigtech`, `halal-core`, `halal-semis` and `halal-health`, plus theme keywords.

**How each leg executes:**
1. Try the wrappers fairest-first, using the live index.
2. Get an Agentic Wallet quote.
3. **Abort if the quote is more than 1% over fair.** The guard is configurable per plan.
4. Swap, then verify the result on-chain by balance delta.
5. Fall back to the next wrapper on learned constraints; for example, Ondo has a $5 minimum through the wallet.

Screening can be switched on or off per plan (`SHARIAH_SCREEN`, `--no-screen`). It runs continuously on the server as a loop.

### 4. A hireable agent (BNB Agent Studio: ERC-8004 + ERC-8183)
Mizan is registered on-chain and takes paid jobs. Send it the task `"<TICKER> <USD>"`. It returns a best-execution report covering every issuer on both channels: real cost vs fair, flags, the fairest route and what to avoid. The report is anchored on-chain as the job's deliverable.

---

## On-chain proof

### Real trades through the Binance Agentic Wallet (BSC mainnet, Sep 25 2026)
Wallet `0xf36A95beeB1e35aDD996F8830440520C4c1406BF`. Its daily limit is set to $1k, the lowest option.

| Buy | Realized cost vs fair | Tx |
|---|---|---|
| $5 → NVDAB | −0.053% | [0xb1bcf919…be11c](https://bscscan.com/tx/0xb1bcf919af80bba7d1843f8bb240b46b38cf5bb707eca201a11b2aa8da7be11c) |
| $1.80 → GOOGLB (halal AI basket) | +0.056% | [0x754b311b…b608c](https://bscscan.com/tx/0x754b311b4cccf6e22fe543460f0155ce157439b4842808b9c45d0b133d8b608c) |
| $2.40 → NVDAB (halal AI basket) | ≈ −0.02% | [0x084a3518…71385](https://bscscan.com/tx/0x084a35185cd5dd789962d3b123e8b7dfb3cce5a1c4a328659c42a5cbdaa71385) |
| $1.80 → MSFTB (halal AI basket) | ≈ −0.34% | [0xe8c3d4d1…cb081](https://bscscan.com/tx/0xe8c3d4d11c7783656c2762a71d777c0df411793e3f26ab44ecf2f8e2662cb081) |

A negative value means we received slightly more stock than the fair value of what we paid. Gas cost about 0.00005–0.00008 BNB per swap.

### Agent identity (ERC-8004)
- BSC mainnet **agentId 359180**: [tx 0xf3ce4366…8bc9f](https://bscscan.com/tx/0xf3ce4366ca55a518982fa4cdadcaf47afc1465bfd7503a1521bfa52bd8a8bc9f)
- BSC testnet **agentId 2503**: [tx 0xdf726a36…ea3cf](https://testnet.bscscan.com/tx/0xdf726a36fb1ae3fb0b22d9e5b1b8952cd4d84bb944d535a0a63610327d1ea3cf)

### A complete paid job (ERC-8183, BSC testnet job #1362)
An outside buyer hired Mizan for `"GOOGL 10000"`, escrowing 1 $U. Mizan picked up the job and **submitted its report on-chain 31 seconds after funding**. After the 15-minute dispute window, the job was settled and the escrow was released to the agent.

| Step | Tx |
|---|---|
| createJob | [0x464ef1e4…fbf85](https://testnet.bscscan.com/tx/0x464ef1e4ffdb1bab8a4ab2ee9655cfb01c72bb1b7ee4cca48c3f6ad1e99fbf85) |
| fund (escrow) | [0xbb3e0a42…de2da](https://testnet.bscscan.com/tx/0xbb3e0a42682cab0e769544c2b6ea7ba4a7dfe5a503ef8694b3e55410244de2da) |
| settle → COMPLETED | [0x05df1641…e72dc](https://testnet.bscscan.com/tx/0x05df16419c7a3d973d75de51ebf9929186f734cf00e0f6df642540d1a33e72dc) |

The deliverable was: *"Buy GOOGL via GOOGLon through the Binance Agentic Wallet: about −0.26% vs fair. Avoid GOOGLon via Web3 API aggregator (+366.9% vs fair)."*

Reproduce it with `hire-test.bat hire GOOGL 10000`.

---

## How "fair" is measured

```
fair price of a token = underlying stock price × that issuer's shares multiplier
real cost             = (USD paid ÷ (tokens received × fair price)) − 1
```

- **Multipliers:** each issuer reinvests dividends differently, so one token can represent 1.0000 or 1.0047 shares. The multiplier comes from Binance's RWA token data (`sharesMultiplier`).
- **Stock price:** comes from Binance's RWA market data. bStocks don't publish an underlying price, so the price from a sibling wrapper of the same stock is used.
- **Quotes are real:** each cost comes from an executable quote at that size, not a mid-price. Web3 API quotes use `aggregator/quote` with a real wallet address, which the API requires for Ondo. Wallet quotes come from `baw market-order quote`.
- **Flags:**
  - *trap:* more than 5% over fair
  - *no real liquidity:* more than 1000%, or the route runs dry at a smaller size
  - *stale:* the reference price is old
  - *exhausted:* larger sizes are skipped once a size returns no liquidity
- **Caveat:** a quote is not a fill. The four real trades above realized within 0.4% of their quotes.

---

## Hackathon requirements

| Requirement | How Mizan meets it |
|---|---|
| Binance Web3 API module | Signed REST API: `aggregator/quote` for the route and cost at each size, `market/rwa/price` and market price, plus the public RWA stock list, status and dynamic endpoints |
| bStocks / Ondo / xStocks | All three are measured. Trades executed in bStocks; the basket falls back across all issuers |
| BSC mainnet spot | All trades are BSC mainnet spot swaps |
| Agentic Wallet / Wallet Skills (special prize) | The basket agent executes through `@binance/agentic-wallet` (`baw`): quote, swap and verify, with a headless server sign-in |
| BNB Agent Studio (special prize) | ERC-8004 identity on mainnet and testnet; ERC-8183 provider built with the `bnbagent` SDK; a full hire → deliver → settle cycle on-chain |

---

## Architecture

```
                 Binance Web3 API (signed)        Binance Agentic Wallet (baw CLI)
                          │                                   │
   scripts/collect.mjs ───┤ every 5 min           wallet-sampler.mjs ── every 15 min (quotes)
                          ▼                                   ▼
                    data/snapshots-*.jsonl           data/wallet-*.jsonl
                          └──────────────┬────────────────────┘
                                src/analyze.mjs  (fair value, costs, safe size, traps, channels)
                                         │
            ┌────────────────────────────┼─────────────────────────────┐
   scripts/server.mjs              scripts/agent.mjs              agent-studio/ (Python)
   dashboard + /api/*        basket agent → executor.mjs       ERC-8183 provider (bnbagent)
   mizan.greateck.com        guarded buys via Agentic Wallet   /erc8183 → report from /api
```

**Hosting:** one Hetzner box, isolated under user `mizan`. Five systemd services: web, collect, wallet, agent and router. Caddy handles HTTPS and routes `/erc8183*` to the Python provider.

---

## Run it yourself

Requires Node 20+. The Agent Studio provider also needs Python 3.10+.

```bash
npm install
cp .env.example .env         # add WEB3_API_KEY / WEB3_API_SECRET from the Binance Web3 dev portal
node scripts/discover.mjs    # build the universe from Binance's RWA lists
node scripts/build-tokens.mjs
node scripts/collect.mjs     # start collecting (loop)
node scripts/server.mjs      # dashboard on http://localhost:8090
```

**Agentic Wallet:**
1. Install `@binance/agentic-wallet` and sign in with `baw auth signin`, or with `--json` plus `baw auth verify` on a headless server.
2. Then run, for example:
   - `node scripts/buy.mjs NVDA 5`
   - `node scripts/agent.mjs plan "$6 into halal AI"`
   - `node scripts/agent.mjs run`

**Agent Studio:**
1. `node scripts/new-agent-key.mjs`
2. `node scripts/register-8004.mjs testnet|mainnet`
3. `cd agent-studio && pip install -r requirements.txt && python scripts/run_agent.py`
4. `node scripts/hire-test.mjs hire NVDA 5000` tests it as a buyer.

Windows one-click wrappers (`*.bat`) are included for each step.

## Repo layout

| Path | What |
|---|---|
| `src/` | API clients (`web3api`, `bapi`, `baw`), `snapshot` (fair vs quote), `analyze` (index), `executor` (guarded buys), `planner` (plain-English plans + Shariah screen) |
| `scripts/` | collector, wallet sampler, server, agent, buy/verify, trapcheck, engines (API vs wallet), discovery, ERC-8004 registration, ERC-8183 buyer test |
| `agent-studio/` | ERC-8183 provider (`bnbagent` SDK); `mizan_task.py` turns a task into a best-execution report |
| `config/` | token universe, Shariah list (SPUS holdings, 2026-09-25), basket presets, agent registration |
| `public/` | dashboard |
| `deploy/` | server setup, headless wallet sign-in, remote command runner |
| `docs/dx-journal.md` | timestamped developer-experience notes kept during the build |

## Safety and limits

- **Price guard:** every buy passes the fair-price guard (1% by default). Manual buys also ask for confirmation.
- **Wallet limits:** the Agentic Wallet has a $1k daily limit and a limited token scope, and holds a small balance.
- **Shariah screen:** this is a holdings-based proxy (SPUS membership). It is not a fatwa or a formal Shariah certification.
- **Not financial advice.** Measurements are point-in-time quotes and can change within minutes.

---

Built by [Greateck](https://greateck.com) · Beirut
