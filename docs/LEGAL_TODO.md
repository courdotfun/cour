# LEGAL_TODO — copy that needs legal review before production

> Purpose: the v8 design asserts specific financial/legal characterizations about the
> tokenized-stock product. The app port deliberately uses **neutral placeholder copy** in
> their place until a human confirms the exact, citable wording with legal/Robinhood. This
> file lists every such spot so nothing legally-loaded ships un-reviewed.

## Stock page (`/stock/[symbol]`, `components/stock/StockView.tsx`)

v8's `openStock`/`stockFill` (design/cour-v8.html) renders these claims; the app does NOT:

| v8 wording (NOT used) | Where | App placeholder (used now) | What to confirm |
|---|---|---|---|
| "is a tokenized **debt security** on Robinhood Chain" | description | "is a tokenized stock on Robinhood Chain that tracks \<name\>'s market price and trades 24/7, settled on-chain." | Is the instrument a debt security / structured note / something else? Use the exact legally-correct term, citable from an official Robinhood/issuer doc. |
| "It tracks the price of the stock **1:1**." | description | (omitted) | Is tracking literally 1:1? Any tracking error / fees / caveats to disclose? |
| "It is **not a share**: no ownership or voting rights" | description | (omitted — but TRUE and arguably required) | Confirm the exact non-ownership / no-voting disclaimer wording to include. |
| "**Backing** = 1:1 share" | stats + about grid | value masked / shown as "—" | What actually backs the token (issuer collateral? synthetic?) and the precise backing statement. |
| "Type = Stock token" | stats | "Stock token" (kept — neutral) | OK? |
| "Trading = Market open / 24/7 token" | about grid | masked (market-hours dependent) | Confirm 24/7 trading language vs underlying market hours. |
| "Pay with any asset in your wallet" (stock order note) | order panel | order panel reused from token page; stock note NOT ported | Confirm the "pay with…" wording once the stock order panel is built. |

Also relevant (already handled in `docs/FRONTEND_CHANGES.md` §4 for other views): "not financial
advice. Stock tokens are not shares." — confirm this blanket disclaimer is sufficient/compliant.

## Action
A human (COUR + legal) replaces each placeholder with confirmed, citable wording, then the
stock copy in `StockView.tsx` is updated and this file's rows are checked off.
