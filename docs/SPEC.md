# COUR Phase 1 — Specification (source of truth)

## Product
Token launchpad on Robinhood Chain. Every token is paired with a Robinhood **Stock Token** (ERC-20 + ERC-8056) instead of ETH. Fixed supply 1,000,000,000 (18 decimals), minted once to the curve. Trades on a virtual constant-product bonding curve priced in the stock token from $4,000 → $60,000 mcap; graduates in-tx at sell-out into a Uniswap v4 pool with the COUR hook; LP burned.

## Parameters
```
TOTAL_SUPPLY        = 1_000_000_000e18
START_MC_USD        = 4_000      (admin-configurable for future launches; snapshot per token)
GRAD_MC_USD         = 60_000
Q                   = 15
CREATOR_FEE         = 100..1000 bps (1%..10%), immutable per token
SPLIT               = 80% creator-side / 20% platform
MAX_INITIAL_BUY     = 50% of supply
LAUNCH_TAX_WINDOW   = 5 s,  start 9900 bps,  taxBps = 9900*(5-dt)^6/5^6
POOL                = v4, fee 0, tickSpacing 60, COUR hook
TWAP_WINDOW         = 1800 s (stock USD),  HOOK_TWAP_WINDOW = 300 s (buyback guard)
MIN_REF_LIQ_USD     = $50k hard floor (configurable); frontend label $250k
LAUNCH_FEE          = 0
DEAD                = 0x…dEaD
```

## Curve math (`CurveMath`)
`x·y=k`, `x=vS` (raw stock), `y=vT` (raw token). At launch: `T0=S·Q/(Q−1)=S·15/14`, `V=T0−S`, `vT0=T0`, `vS0 = startMc·1e18·10^d/stockUsdX18 · T0/S`, `k=vS0·vT0`, `vTStop=√(V·T0)`. Price = `vS/vT`. Stop at `vT=vTStop` → price = 15·p0 → mcap = $60k at the launch stock price (graduation fixed in stock units at launch). Tokens sold ≈ 794,786,904; left for pool ≈ 205,213,096. **Identity:** leftover-tokens value at the stop price exactly equals raised stock → balanced full-range LP.

**Buy**: `tax` (if in window; creator initial buy & buybacks exempt) + `fee=bps·gross` on gross → `net`; constant-product on net; cap at `vTStop` with refund (incl. proportional fee/tax) and graduate. Rounding favours the curve. **Sell**: gross stock out, `fee=bps·gross`, no tax. Invariant `vS≥vS0`.

## Launch tax (`LaunchTax`)
Integer `9900*(5−dt)^6/5^6`, per whole second, buys only. dt=0 → a buy pays 99%+fee > 100% → reverts (you cannot buy in the launch second). Exemptions: atomic `initialBuy`, vault buybacks.

## Contracts
- **COURToken** — ERC20+Permit, fixed supply, no mint/burn/owner/pause. `_update` → `feeVault.beforeBalanceChange` in HOLDERS mode (O(1), non-reverting).
- **COURCurve** (EIP-1167 clone) — `buy/sell/initialBuy`, quotes, `progressBps`, graduates via `factory.graduate`. Post-graduation trades revert. Vault buybacks pay no fee.
- **COURFactory** — `createToken` (validate → price → clone + CREATE2 token → register → optional initial buy), `graduate` (onlyCurve: init pool, full-range `modifyLiquidity` owned by factory = burned, dust to DEAD/platform), admin (future launches only).
- **COURHook** — `beforeInitialize` gating (onlyFactory, fee 0, spacing 60, COUR token+its stock); `beforeSwap` buy fee (+tax) via `BeforeSwapDelta`+`take`; `afterSwap` sell fee via return delta+`take`; per-pool tick accumulator → `consult`/`priceInfo`/`poolStockReserve`; exact-output reverts; vault exempt. Fee always in stock.
- **COURFeeVault** — `notify` (20/80 split by mode), `claim`/`claimHolder`/`claimPlatform`, `beforeBalanceChange` (dividend accounting, excludes curve/PM/DEAD/vault/router/0), `executeBuyback` (onlyCreator, modes 2/3, min-$50 + 2%-reserve + 3%-deviation guards), two-step `setFeeRecipient`/`acceptFeeRecipient`. SafeERC20, transient reentrancy guards.
- **COURPriceReader** — `stockUsd` (v3 TWAP: USDG direct or STOCK/WETH×WETH/USDG), `refLiquidityUsd`, `bumpCardinality`, `uiMultiplier`, `consult`. No third-party oracles.
- **COURRouter** — `buy/sell` (curve pre-grad, pool post-grad via own `unlock`), `buyWithETH` (v3), quotes; holds no funds.

## Creator modes
`0 CREATOR` (claimable by feeRecipient), `1 HOLDERS` (dividend-per-share, each holder claims), `2 BUYBACK` (creator triggers, tokens to feeRecipient), `3 BUYBACK_BURN` (tokens to DEAD).

## Out of scope (Phase 1)
Frontend, indexer, backend, limit orders, mixed fee modes, notifications, aggregators, perps, governance.

(Events/errors: `libraries/Events.sol`, `libraries/Errors.sol`. Full rationale: DECISIONS.md. Risks: RISKS.md.)
