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
