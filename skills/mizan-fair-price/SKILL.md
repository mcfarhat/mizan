---
name: mizan-fair-price
description: Fair-price guard for buying tokenized stocks (Ondo "…on", bStocks "…B", xStocks "…x", e.g. NVDAon, GOOGLB, TSLAx) on BNB Chain with the Binance Agentic Wallet. Use BEFORE any `baw market-order quote/swap` or `baw limit-order buy` into a tokenized stock, or whenever the user asks to buy a stock, ETF (SPY, QQQ) or "halal"/Shariah-compliant stock on-chain. Picks the fairest issuer token, blocks trades that cost more than the limit over fair value, and verifies the wallet's own quote.
---

# Mizan fair-price guard for tokenized stocks

One stock can exist on BNB Chain as up to three tokens from different issuers: Ondo (`NVDAon`), Binance bStocks (`NVDAB`) and xStocks (`NVDAx`). Their liquidity differs a lot, and it collapses after US market hours and at weekends. Some routes quoted as "best" lose most of the order's value. Mizan (https://mizan.greateck.com) measures every issuer, on the Binance Web3 API and on the Agentic Wallet, against fair value every 5 to 15 minutes.

**Fair value** = underlying stock price × the issuer's shares multiplier.
**Cost** = the real quoted fill vs fair value. Negative means you get slightly more than fair.

## When to use

- The user asks to buy a US stock or ETF, or a tokenized stock, with the Agentic Wallet.
- The user asks to buy a Shariah-compliant or "halal" stock or basket.
- You are about to run `baw market-order swap` or `baw limit-order buy` with a `--toToken` that is a tokenized stock.

## Procedure

### 1. Identify the ticker and the USD amount
Take the ticker from the user's words or from the token symbol by removing the issuer suffix: `NVDAon`, `NVDAB` and `NVDAx` all map to `NVDA`.

### 2. Ask Mizan for the fairest route
Use the Agentic Wallet channel, because that is the channel you will trade through:

```bash
curl -s "https://mizan.greateck.com/api/check/NVDA?usd=500&channel=wallet&maxCost=1"
```

Parameters:
- `usd`: the trade size in USD.
- `channel=wallet`: rank only Agentic Wallet quotes. Use `any` to also see the Web3 API.
- `maxCost`: the most you will accept over fair, in %. Default 1. Use a lower value if the user asks for it.

The key fields in the response:

| Field | Meaning |
|---|---|
| `go` | `true` if the fairest route is within `maxCost` |
| `verdict` | one plain-English sentence; show it to the user |
| `best.symbol`, `best.token` | the token to buy and its BSC contract address, for `--toToken` |
| `best.costVsFairPct` | Mizan's measured cost for this route |
| `options[].fairPriceUsd` | fair price per token, used to verify your own quote in step 3 |
| `avoid`, `noLiquidity` | routes that are over the limit, or can't be bought at this size |
| `shariah` | starts with `SPUS` when the stock passes the Shariah screen (held by the SP Funds S&P 500 Sharia ETF) |

If `go` is `false`, **do not swap**. Show the user the `verdict` and suggest one of:
- a smaller size
- waiting for US market hours (13:30–20:00 UTC, Mon–Fri)
- another issuer from `options`

If the user asked for Shariah-compliant stocks and `shariah` does not start with `SPUS`, say so and don't buy.

### 3. Get your own quote and verify it against fair value
Quotes move, so check the one you are about to execute:

```bash
baw market-order quote --binanceChainId 56 --fromToken USDT --toToken <best.token> --fromTokenQty 500 --json
```

Then compute the cost from the quote:

```
cost% = (500 / (toCoinAmount × fairPriceUsd) − 1) × 100
```

`fairPriceUsd` comes from the matching entry in `options`. If the cost is above `maxCost`, stop and report it; don't swap.

### 4. Swap
Only swap after the user confirms the token, the amount and the cost:

```bash
baw market-order swap --binanceChainId 56 --fromToken USDT --toToken <best.token> --fromTokenQty 500 --slippage 1 --json
```

### 5. Report
Tell the user:
- the token bought, its issuer and the amount
- the cost vs fair
- the order ID

## Notes and pitfalls

- **CLI flags:** v1.10.0 uses `--fromTokenQty` and `--binanceChainId 56`. Examples using `--amount` fail.
- **Ondo minimum:** Ondo tokens need at least $5 per order through the Agentic Wallet. The error text (315008) states this rule the wrong way round. For smaller orders, use the bStocks token (`…B`).
- **xStocks:** on BSC these often have no liquidity and stale prices. Mizan marks them in `noLiquidity`.
- **Wallet quote sizes:** Mizan samples the Agentic Wallet at $1k and $10k. For other sizes it returns the nearest measured size (`measuredAtUsd`). Step 3 is your check at the exact size.
- **If Mizan is unreachable:** you can still verify with step 3. Take fair value from the Binance RWA price data (stock price × `sharesMultiplier`). If you can't establish fair value, warn the user before buying.
- This skill checks price fairness only. It is not investment advice. The Shariah screen is a holdings-based proxy, not a fatwa.

## Also available

- `GET https://mizan.greateck.com/api/route/<TICKER>?usd=N`: the fairest issuer on the Web3 API.
- `GET https://mizan.greateck.com/api/index`: the full index.
- Hire Mizan on-chain for a signed report: BNB Agent Studio / ERC-8183 at `https://mizan.greateck.com/erc8183`, task `"<TICKER> <USD>"`. BSC agentId 359180.
