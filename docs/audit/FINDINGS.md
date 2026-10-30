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

### L-2 — Buyback deviation TWAP span near-zero immediately after graduation  📝 ACKNOWLEDGED
- **File:** `src/COURHook.sol:298-321` (`priceInfo`/`consult`).
- **Issue:** for the first `HOOK_TWAP_WINDOW` (300s) after graduation `prevAnchorTs==0`, so the TWAP mean is
  over a very short span and ≈ spot, making the 3% deviation guard trivially satisfied for an early buyback.
- **Assessment:** the buyback is the creator's own funds buying their own token, capped at 2% reserve +
  `minBuybackUsd` + `minTokensOut`; mostly self-affecting. RISKS.md already states the hook TWAP is "a
  deviation guard, not a high-fidelity oracle." A hard fix (reject buyback until a full window elapses) would
  block all buybacks for 300s post-graduation and break the immediate-buyback flow — not cheap for a LOW,
  self-affecting issue.
- **Status:** ACKNOWLEDGED / documented (RISKS.md). Recommended hardening for the formal audit: require
  `span >= HOOK_TWAP_WINDOW` before trusting the deviation guard. NOT changed (disruptive, low value).

### L-3 — `refLiquidityUsd` uses spot `balanceOf`, donation-inflatable to bypass the thin-pool floor  📝 ACKNOWLEDGED
- **File:** `src/COURPriceReader.sol:92-103`, gated at `COURFactory.sol:98`.
- **Issue:** a one-time USDG/WETH transfer into the reference v3 pool inflates `refLiquidityUsd` to pass
  `minRefLiqUsd`, letting an otherwise-thin pool clear the launch floor.
- **Assessment:** bypasses a SAFETY FLOOR only (no fund theft); the launch price itself uses the 1800s TWAP
  (manipulation-resistant); the attacker loses the donated funds; and the **launch allowlist is ON** (only
  trusted creators can launch during the closed phase). RISKS.md already calls `refLiquidityUsd` "a proxy."
- **Status:** ACKNOWLEDGED / documented. Harden before opening the allowlist: derive reference liquidity from
  in-range liquidity (slot0 + `liquidity`) rather than raw `balanceOf`.

### L-4 — Graduation opening price derived from manipulable curve `balanceOf`  📝 ACKNOWLEDGED
- **File:** `src/GraduationImpl.sol:47-55` (reads `stockRaised`/`tokenLeftover` from `COURCurve._graduate`).
- **Issue:** donating stock/tokens to the curve before sell-out skews `amount0/amount1` and thus the opening
  v4 pool `sqrtPrice`.
- **Assessment:** griefing with attacker self-cost (the donation is locked into the burned LP), arb-corrected
  quickly, and allowlist-mitigated. The current reals-based price is proven balanced vs the curve spot within
  0.1% (`GraduationIdentity.t.sol`).
- **Status:** ACKNOWLEDGED. Recommended hardening: derive the opening `sqrtPrice` from the stored curve
  params (`vS_final/vTStop`) instead of live balances, treating surplus as dust. NOT changed now (deeper
  change; LOW; self-costly).

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
**Summary:** 1 CRITICAL fixed (+regression test), 1 LOW fixed, 1 INFO fixed (hardening); 3 LOW acknowledged/
documented with mitigations; 2 rejected (1 by-design, 1 false-positive with file:line proof). A human audit is
still recommended before opening the allowlist (see GO_LIVE.md).
