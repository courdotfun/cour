# Risks & Known Limitations

## Centralization / admin
Admin is `Ownable2Step` → to be a 48h `TimelockController` behind a Safe multisig (`04_HandOver.s.sol`). Admin powers are limited to **future** launches and cannot touch existing tokens:
- `setStock` (allowlist + reference pool), `setLaunchParams` (start/grad mcap, min ref liq, launch fee), `setLaunchesPaused`, `setTreasury`/`setMinBuybackUsd` (vault), PriceReader config.
- Admin **cannot**: change an existing token's fee/mode/recipient, move curve/pool/vault balances owed to others, pause trading or claims, or remove graduated liquidity. Proven by `test/unit/Admin.t.sol::test_admin_cannot_change_existing_token` and invariant `invariant_*`.

## Stock token behaviour
- **Pause**: a paused stock makes only the affected transfer/claim revert; `notify` accrual never moves stock, so accounting cannot corrupt. Claims can be retried after unpause.
- **Decimals**: read via `decimals()`, never assumed; tested 6/8/18. The `1e18` precision factor in `CurveMath` keeps `p0 > 0` for all tested decimals/prices.
- **ERC-8056 splits**: raw balances never rebase; all accounting is in raw units. `uiMultiplier` is surfaced for display only.
- **US persons**: stock tokens are not available to US persons. Not a contract concern, but **the deployer must enforce geo-restriction at the frontend/legal layer.**

## Sandwich / MEV
- Graduation happens in the same tx as the triggering buy (atomic) and the leftover-tokens-value == raised-stock identity makes the pool open balanced, reducing graduation sandwich surface. Users still pass `minTokensOut`/`deadline`.
- Buyback: TWAP deviation guard (3% from the hook's ~5-min accumulator) + 2%-of-reserve cap + `minTokensOut`.

## Oracle
- Prices come only from Uniswap v3 TWAPs (1800s) on Robinhood Chain. **No third-party oracles.** A stock whose reference pool lacks observation history reverts `TwapNotReady`; `bumpCardinality` must be called ahead of launches.
- `refLiquidityUsd` is a 2×(quote reserve) proxy, not an exact TVL; it gates only the thin-pool floor. The
  reserve is the pool's **in-range (virtual) reserve** from active `liquidity`+`slot0`, not raw `balanceOf`, so
  a donation into the pool cannot inflate it (L-3 hardening).
- The hook TWAP accumulator uses a rolling two-anchor scheme giving a window in ~[300s, 600s]; it is a deviation **guard**, not a high-fidelity oracle. Approximate by design.

## Buyback post-graduation reserve cap
- The 2%-of-reserve cap post-graduation computes the full-range stock reserve from `getLiquidity` + `sqrtPrice` via `SqrtPriceMath`. This is best-effort; extreme price states could make it approximate. The deviation + `minTokensOut` guards remain the primary protection.

## `buyWithETH`
- Routes a configurable v3 multi-hop (WETH→USDG→stock) via SwapRouter02 `exactInput`, using an admin-set encoded path per stock (real pool fee tiers; direct WETH→stock fallback). If no path is configured for a stock it reverts `PathNotConfigured`; use `buy()` with the stock directly. Convenience only; core logic does not depend on it or on the Universal Router.

## Exact-output swaps
- Rejected (`ExactOutputNotSupported`) in Phase 1. Enabling the stretch goal requires implementing and fully testing exact-output fee handling in both directions.

## Decimal/price extremes
- `CurveMath.k = vS0 * vT0` is a single `uint256`. For realistic launch params (start $4k, stock $1–$5000, decimals 6–18) it stays far below 2^256 (see AUDIT_SCOPE). Pathological admin params combined with extreme prices could overflow; `setLaunchParams` should stay within sane bounds.

## Unaudited code live on mainnet (accepted, mitigated by the allowlist)
- The contracts are **deployed to Robinhood Chain mainnet without a third-party audit** (closed test phase). This is an accepted risk for the controlled test, mitigated by: the launch **allowlist is enabled** (only the deployer can create tokens), ownership stays with the deployer EOA (no public multisig yet), and production launch params are restored (4000/60000) after the smoke test. Before opening to the public: commission an audit, move the key to a hardware wallet, hand over to a Safe + 48h Timelock, and only then disable the allowlist. See `docs/AUDIT_SCOPE.md`.
- The deploy wallet is a hot EOA whose key lives in a local `.env`. It must be rotated / moved to a hardware wallet before holding any meaningful value or admin power long-term.

## Environment / verified on-chain (2026-10-29)
- Chain addresses, NVDA metadata, NVDA/USDG TWAP (~$214), WETH/USDG pool, and PositionManager ABI **verified on mainnet** (`test/fork/*`, `docs/CHAIN_FACTS.md`).
- **Cancun/transient storage confirmed** via the live v4 PoolManager (it cannot function without TSTORE).
- Graduation against the **real** mainnet PositionManager proven on a fork (`ForkIntegration.t.sol`: `ownerOf(positionId)==DEAD`).
