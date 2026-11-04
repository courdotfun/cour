# COUR — Audit Findings (pashov solidity-auditor, 12 agents + adversarial verify)

> Scan: 12 specialty hacking agents in parallel → dedup → adversarial verification. 22 raw findings/leads
> → 18 unique → **1 CRITICAL confirmed** (by 7 independent agents), 1 rejected, 10 LOW/INFO leads.
> No High confirmed. Each finding below: ID, severity, file:line, description, PoC/test, fix, status.

## CRITICAL

### C-1 — HOLDERS self-transfer double-credits dividends → vault drain  ✅ FIXED
- **File:** `src/COURFeeVault.sol:149-163` (`beforeBalanceChange`) + `_settleToNewBalance:166-172`.
- **Root cause:** `COURToken._update` calls `vault.beforeBalanceChange(from,to,value)` BEFORE `super._update`
  moves balances (COURToken.sol:53-59). OZ ERC20 does not short-circuit self-transfers. For a self-transfer
  (`from==to==holder`, both eligible), BOTH `_settleToNewBalance` calls run on the SAME holder, each
  re-reading the live (pre-move) `balanceOf`. Call 1 (from) zeroes `_debt`; Call 2 (to) re-reads the same
  `oldBal` against the now-zero debt and credits `_pending += balance*accPerShare/1e36` — phantom dividends.
  `eligibleSupply` is untouched (`fe && te`). `claimHolder` pays the phantom stock; repeating the net-zero
  self-transfer drains the vault's SHARED stock balance (which backs every token on that stock:
  `creatorOwed`, other holders' dividends, `platformOwed`) → cross-token insolvency.
- **Confirmed by:** access-control, asymmetry, numerical-gap, invariant, execution-trace, flow-gap,
  boundary agents (7×), all independently; adversarial verify = CONFIRMED critical.
- **PoC / test:** `test/integration/HoldersSelfTransfer.t.sol` —
  `test_self_transfer_does_not_inflate_pending` (pending unchanged after 10 self-transfers) and
  `test_vault_stays_solvent_after_self_transfer_spam` (Σ claimable ≤ vault stock balance after 20
  self-transfers; claim conserves vault balance).
- **Fix:** early return in `beforeBalanceChange` when `from == to` (a self-transfer nets zero: balance and
  eligibility unchanged, so no settle is needed). `src/COURFeeVault.sol`.
- **Status:** FIXED + tested (green). Requires redeploy (vault is immutable-referenced by curve/hook/factory).

## LOW

### L-1 — Buyback 2%-reserve cap skipped when reserve == 0  ✅ FIXED
- **File:** `src/COURFeeVault.sol:280-293` (`executeBuyback`).
- **Issue:** pre-grad `if (stockIn > cap && poolStock > 0)` and post-grad `if (reserve > 0 && stockIn > cap)`
  skip the cap entirely when the reserve reads 0, permitting an unbounded buyback against empty/virtual
  reserves (large curve price impact). Creator-funded + capped by owed, but the guard should not silently
  disable.
- **Fix:** treat a zero reserve as un-sizable → `revert BuybackTooLarge()` (both branches).
- **Status:** FIXED. (No existing test regressed; reserve>0 in all current tests.)

### L-2 — Buyback deviation TWAP span near-zero immediately after graduation  ✅ FIXED (hardening 2026-11-01)
- **File:** `src/COURHook.sol` (`priceInfo`/`consult`), guarded in `src/COURFeeVault.sol:executeBuyback`.
- **Issue:** for the first `HOOK_TWAP_WINDOW` (300s) after graduation `prevAnchorTs==0`, so the TWAP mean is
  over a very short span and ≈ spot, making the 3% deviation guard trivially satisfied for an early buyback.
- **Fix:** added `COURHook.twapWindowFull(token)` (true once the TWAP reference anchor is ≥ `HOOK_TWAP_WINDOW`
  seconds old) and gated the POST-graduation buyback on it: `executeBuyback` now reverts the new
  `Errors.TwapWindowNotReady()` before `_checkDeviation` when the window is not yet full. Pre-graduation
  buybacks (deterministic curve buy, no pool/TWAP) are unaffected.
- **Tests:** `BuybackGuards.t.sol::test_buyback_reverts_until_twap_window_full_postgrad` (revert at 0s / window-1,
  success after the boundary) and `::test_buyback_pregrad_ignores_twap_window`. Existing post-grad guard tests
  and the fork rehearsal now elapse the window first.
- **Status:** FIXED. Trade-off (buybacks wait 300s post-graduation) is accepted — it is the behaviour the
  reviewer requested.

### L-3 — `refLiquidityUsd` uses spot `balanceOf`, donation-inflatable to bypass the thin-pool floor  ✅ FIXED (hardening 2026-11-05)
- **File:** `src/COURPriceReader.sol` (`refLiquidityUsd` + new `_inRangeReserve`), gated at `COURFactory.sol:98`.
- **Issue:** a one-time USDG/WETH transfer into the reference v3 pool inflated `refLiquidityUsd` (it read raw
  `balanceOf`) to pass `minRefLiqUsd`, letting an otherwise-thin pool clear the launch floor.
- **Assessment:** bypassed a SAFETY FLOOR only (no fund theft); the launch price itself uses the 1800s TWAP
  (manipulation-resistant); the attacker loses the donated funds; and the **launch allowlist is ON** (only
  trusted creators can launch during the closed phase). RISKS.md already called `refLiquidityUsd` "a proxy."
- **Fix:** `refLiquidityUsd` now values the USD-side leg from the pool's **in-range (virtual) reserve** —
  derived from the active `liquidity()` and `slot0.sqrtPriceX96` (token0: `L·2^96/sqrtP`; token1:
  `L·sqrtP/2^96`, via `FixedPointMathLib.fullMulDiv`) — instead of `balanceOf`. A raw donation changes neither
  `L` nor the price, so it can no longer move the floor; a pool with zero active liquidity reports 0.
- **Tests:** `PriceReaderTest.t.sol::test_refLiquidityUsd_ignores_donations` (10M donation leaves the floor
  unchanged), `::test_refLiquidityUsd_zero_when_no_liquidity` (empty pool → 0 even after a donation), and the
  WETH-route test now asserts the same donation-invariance. `MockV3Pool` gained `setLiquidity` and derives
  `slot0.sqrtPriceX96` from its tick.
- **Status:** FIXED. (Floor is now donation-proof; safe to open the allowlist from the L-3 angle.)

### L-4 — Graduation opening price derived from manipulable curve `balanceOf`  ✅ FIXED (hardening 2026-11-01)
- **File:** `src/GraduationImpl.sol`, `src/COURFactory.sol::graduate`.
- **Issue:** donating stock/tokens to the curve before sell-out skewed `amount0/amount1` (read from
  `balanceOf`) and thus the opening v4 pool `sqrtPrice` and the burned LP size.
- **Fix:** the opening price and LP amounts are now derived from the curve's INTERNAL accounting:
  `acctStock = divUp(k, vTStop) - vS0` (the exact solvent raise) and
  `acctToken = TOTAL_SUPPLY - (vT0 - vTStop)` (the exact unsold-token count, SP-04). The factory passes
  `vS0/vT0/vTStop/k` to `GraduationImpl` (instead of balances). The mint consumes only the accounting amounts;
  any donated excess (balanceOf − accounting) is swept out — stock → platform bucket, tokens → DEAD — so it
  never enters the pool or moves the price.
- **Tests:** `GraduationDonation.t.sol::test_donation_does_not_move_pool_price_or_inflate_lp` (donate stock +
  tokens pre-grad → pool price == curve price within 0.1%, donation routed to platform/DEAD, nothing stranded)
  and `::testFuzz_donation_price_invariant` (decimals {6,8,18} × price $1–$5000 × bounded donation).
- **Status:** FIXED. Donations can no longer influence the graduation price; they are forfeited to
  platform/DEAD.

## INFO

### I-1 — `GraduationImpl.graduate` externally callable  ✅ FIXED (defense-in-depth)
- **File:** `src/GraduationImpl.sol`.
- **Assessment:** a direct (non-delegatecall) call is already inert — `address(this)` = impl (zero balances)
  and `poolManager.initialize` reverts via the hook's `beforeInitialize` (`sender != factory`). No exploit.
- **Fix:** added an `__self` immutable + `if (address(this) == __self) revert OnlyDelegatecall()` guard so
  direct calls revert explicitly. `GraduationImpl` also declares NO mutable storage (delegatecall-safe).
- **Status:** FIXED (hardening).

## Rejected / False positives (with proof)

### FP-1 — HOLDERS curve buyer "captures own fee"  ❌ NOT A BUG
- `src/COURCurve.sol:141-147`. The buyer receives tokens (becomes eligible) before the fee `notify`, so part
  of their own fee accrues to themselves. Verified by the adversarial pass as **by-design, self-harm only, no
  value extraction** — a documented dividend mechanic, not a vulnerability.

### FP-2 — "Unaccounted refund" in a pre-graduation buyback that triggers graduation  ❌ FALSE POSITIVE
- `src/COURFeeVault.sol:285`. Claimed the refund of a graduation-crossing buyback is not re-credited.
  **Proof it is correct:** `executeBuyback` does `(tokensOut, stockIn) = ICOURCurve(t.curve).buy(stockIn, …)`
  — `stockIn` is REASSIGNED to the curve's returned `stockUsed`, and `t.buybackOwed = owed - stockIn`
  (line ~295) therefore subtracts the USED amount; the refunded remainder stays in the vault's stock balance
  and remains reflected in `buybackOwed`. No loss.

---
**Summary:** 1 CRITICAL fixed (+regression test), all 4 LOW fixed (L-1 cap, L-2 TWAP window, L-3 donation-proof
floor, L-4 graduation price — each with regression tests), 1 INFO fixed (hardening); 2 rejected (1 by-design, 1
false-positive with file:line proof). No findings remain open. A human audit is still recommended before
opening the allowlist (see GO_LIVE.md).
