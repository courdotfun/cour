# Invariant Map

> COUR Phase 1 | 24 guards | 18 inferred | 7 not enforced on-chain

---

## 1. Enforced Guards (Reference)

Per-call preconditions. Heading IDs below (`G-N`) are anchor targets from x-ray.md attack surfaces.

#### G-1
`if (msg.value != launchFee) revert WrongLaunchFee()` · `COURFactory.sol:90` · Forces exact launch-fee payment (0 in Phase 1); rejects accidental ETH that would otherwise be stranded in the factory.

#### G-2
`if (launchesPaused) revert LaunchesPaused()` · `COURFactory.sol:91` · Admin kill-switch for NEW launches only; never blocks existing-token trading or claims.

#### G-3
`if (launchAllowlistEnabled && !launchAllowlist[msg.sender]) revert NotAllowlisted()` · `COURFactory.sol:92` · Gates the closed mainnet test phase to the deployer; the sole live access restriction on `createToken`.

#### G-4
`if (!stockAllowed[p.stock]) revert StockNotAllowed()` · `COURFactory.sol:93` · Restricts pairing to admin-vetted Robinhood stock tokens that have a configured reference pool.

#### G-5
`if (p.creatorFeeBps < CREATOR_FEE_MIN_BPS || p.creatorFeeBps > CREATOR_FEE_MAX_BPS) revert FeeOutOfRange()` · `COURFactory.sol:94` · Pins the immutable per-token creator fee to [1%,10%]; enforces the fee-bound invariant at the only write site.

#### G-6
`if (p.creatorMode > CREATOR_MODE_MAX) revert WrongMode()` · `COURFactory.sol:97` · Range-validates the untrusted uint8 mode before casting to the CreatorMode enum.

#### G-7
`if (priceReaderC.refLiquidityUsd(p.stock) < minRefLiqUsd) revert ThinReferencePool()` · `COURFactory.sol:98` · Thin-pool floor so the launch TWAP price is not trivially manipulable.

#### G-8
`if (tokensOut > MAX_INITIAL_BUY_TOKENS) revert InitialBuyTooLarge()` / `if (used != p.initialBuyStock) revert InitialBuyTooLarge()` · `COURFactory.sol:144,146` · Caps creator self-buy at 50% of supply and forbids graduation inside the launch tx.

#### G-9
`if (msg.sender != curveOf[token]) revert OnlyCurve()` · `COURFactory.sol:166` · Only the token's own curve clone may trigger graduation; blocks arbitrary graduation calls.

#### G-10
`if (gradMcUsd_ <= startMcUsd_ || startMcUsd_ == 0) revert FeeOutOfRange()` · `COURFactory.sol:218` · Keeps Q = grad/start > 1 so curve math (T0 = S·Q/(Q−1)) is well-defined for future launches.

#### G-11
`if (msg.sender != factoryAddr) revert OnlyFactory()` + `if (_initialized) revert AlreadyInitialized()` · `COURCurve.sol:58-59` · One-shot init latch; only the factory configures a fresh clone, implementation is locked in the constructor.

#### G-12
`if (block.timestamp > deadline) revert Expired()` · `COURCurve.sol:108,161` · Trade deadline protection against delayed inclusion / stale slippage bounds.

#### G-13
`if (graduated) revert Graduated()` · `COURCurve.sol:109,162` · Hard-stops all curve trading once the token has graduated to the v4 pool.

#### G-14
`if (fee + tax >= gross) revert ZeroAmount()` · `COURCurve.sol:115` · Anti-snipe: a buy in the first launch second (99% tax + fee) exceeds the input and is rejected cleanly.

#### G-15
`if (tokensOut < minTokensOut) revert Slippage()` / `if (r.graduates && !allowGraduation) revert InitialBuyTooLarge()` · `COURCurve.sol:119,121,170` · Buyer slippage floor and the initial-buy graduation prohibition.

#### G-16
`require(newVT <= vT0, "vT>vT0")` · `CurveMath.sol:119` · Sell cannot push virtual token reserve above its launch value (would imply selling more than ever sold).

#### G-17
`require(stockUsdX18 > 0 && gradMcUsd > startMcUsd && startMcUsd > 0)` + `require(vS0 > 0)` · `CurveMath.sol:46,59` · Launch-param sanity so price/reserve math never divides by zero or produces a zero start price.

#### G-18
`if (sender != address(factory)) revert OnlyFactory()` + `if (key.fee != POOL_LP_FEE || key.tickSpacing != POOL_TICK_SPACING) revert BadPoolKey()` · `COURHook.sol:99-102` · Only the factory may initialize a hook-bearing pool, and only with fee 0 / tickSpacing 60.

#### G-19
`if (msg.sender != address(poolManager)) revert OnlyHook()` · `COURHook.sol:66` · Restricts every hook callback to the canonical v4 PoolManager.

#### G-20
`if (!EXACT_OUTPUT_ENABLED && params.amountSpecified > 0) revert ExactOutputNotSupported()` · `COURHook.sol:148` · Phase-1 rejects exact-output swaps (fee handling only implemented for exact-input).

#### G-21
`if (!t.registered) revert OnlyHookOrCurve()` + `if (msg.sender != hook && msg.sender != t.curve) revert OnlyHookOrCurve()` · `COURFeeVault.sol:121-122` · Fee accrual may be reported only by the token's own curve or the shared hook, for a registered token.

#### G-22
`if (msg.sender != t.feeRecipient) revert OnlyCreator()` · `COURFeeVault.sol:193,259` / `setFeeRecipient:234` · Only the current fee recipient may claim CREATOR funds, trigger a buyback, or rotate the recipient.

#### G-23
buyback guards: `if (stockIn == 0) revert BuybackTooSmall()`; `if (usd < minBuybackUsd) revert BuybackTooSmall()`; `if (... > reserve*BUYBACK_MAX_POOL_BPS/BPS) revert BuybackTooLarge()`; `if (diff*BPS > twap*BUYBACK_MAX_DEVIATION_BPS) revert PriceDeviation()` · `COURFeeVault.sol:263,268,276/286,303` · Bounds every buyback by min USD notional, 2% of pool reserve, and 3% TWAP deviation.

#### G-24
`require(msg.sender == address(_pm), "PM")` · `PoolManagerSwapper.sol:46` · The v4 unlock callback is accepted only from the PoolManager; prevents spoofed swap settlement.

---

## 2. Inferred Invariants (Single-Contract)

#### I-1

`Conservation` · On-chain: **Yes**

> `COURToken.totalSupply() == 1_000_000_000e18` for the life of the token; the entire supply is minted once to the curve.

**Derivation** — Δ-pair: `COURToken.sol:43` (`_mint(curve_, TOTAL_SUPPLY)` in constructor) with NO other mint/burn site (contract exposes no mint/burn, `_update` only moves balances).

**If violated** — curve accounting (`vT`/`vS` vs real token balance) and dividend eligible-supply math desync.

---

#### I-2

`Conservation` · On-chain: **Yes**

> Curve solvency: `stock.balanceOf(curve) >= vS - vS0` (up to curve-favouring dust) at all times pre-graduation.

**Derivation** — Δ-pair: `COURCurve.sol:134-138` (buy: `_vS += net`, pull `gross` stock in) ↔ `COURCurve.sol:172-181` (sell: `_vS = k/newVT` up, pay `stockOut` down); all rounding rounds `newVS`/`newVT` up (`CurveMath.divUp` :90,:121).

**If violated** — the curve could not honour sells / graduation transfer; breaks the raised-stock == pool-liquidity identity.

---

#### I-3

`Bound` · On-chain: **Yes**

> Per-token `creatorFeeBps ∈ [100, 1000]` and is immutable after launch.

**Derivation** — guard-lift: `require(creatorFeeBps in [MIN,MAX])` `COURFactory.sol:94`; only write site is the `TokenConfig` snapshot at `COURFactory.sol:119` → copied read-only into `COURCurve._feeBps` (`initialize` :64) and `COURHook.PoolInfo.feeBps` (`beforeInitialize` :123). No setter exists.

**If violated** — fees could exceed the advertised 10% cap or the 20/80 split assumptions.

---

#### I-4

`StateMachine` · On-chain: **Yes**

> `COURCurve.graduated` is a one-shot latch: `false → true`, never reversed; all trading reverts afterward.

**Derivation** — edge: `graduated = true` @ `COURCurve.sol:189` (`_graduate`) with `if (graduated) revert` guarding both `_buy` :109 and `sell` :162; no write sets it back to false.

**If violated** — double-graduation or post-graduation curve trades against a drained clone.

---

#### I-5

`StateMachine` · On-chain: **Yes**

> `COURCurve._initialized` is a one-shot latch; the implementation is locked at deploy, each clone initializes exactly once.

**Derivation** — edge: `_initialized = true` @ constructor `COURCurve.sol:51` (impl) and @ `initialize` :60, guarded by `if (_initialized) revert` :59.

**If violated** — curve parameters (reserves, fee, stock) could be overwritten, re-pricing an active token.

---

#### I-6

`StateMachine` · On-chain: **Yes**

> `COURFeeVault._wired` is a one-shot latch; factory/hook/router/priceReader are set exactly once.

**Derivation** — edge: `_wired = true` @ `COURFeeVault.sol:79`, guarded by `if (_wired) revert AlreadyInitialized()` :73.

**If violated** — an attacker-set hook/curve could forge fee `notify` calls (see X-3).

---

#### I-7

`StateMachine` · On-chain: **Yes**

> Per-token vault registration is one-shot: `registered false → true`.

**Derivation** — edge: `t.registered = true` @ `COURFeeVault.sol:106`, guarded by `if (t.registered) revert` :105; caller gated to factory (G-21 sibling :103).

**If violated** — a token's stock/creator/curve bindings could be rebound after fees accrued.

---

#### I-8

`Bound` · On-chain: **Yes**

> Fee split is exactly `platform = floor(amount·2000/10000)`, `creatorSide = amount − platform (≥ 80%)` on every `notify`.

**Derivation** — Δ-pair: `COURFeeVault.sol:125-127` (`plat = amount*PLATFORM_SHARE_BPS/BPS`; `creatorSide = amount - plat`; `platformOwed += plat`) — the only split site; the whole `amount` is partitioned with no remainder.

**If violated** — platform over-collects or creator buckets are under-credited.

---

#### I-9

`Ratio` · On-chain: **Yes**

> Constant product: buy sets `newVT = divUp(k, vS+net)`; sell sets `newVS = divUp(k, vT+tokensIn)` — `k = vS0·vT0` fixed at launch.

**Derivation** — Ratio: `CurveMath.sol:90` (buy, `newVT` from `newVS`, rounded up) and `CurveMath.sol:121` (sell, `newVS` from `newVT`, rounded up); `k` written once in `computeLaunchParams` :63 and `initialize` :73, never mutated.

**If violated** — price path diverges from x·y=k; mispriced trades or solvency drift.

---

#### I-10

`Bound` · On-chain: **Yes**

> Graduation stop is reached exactly at `vT = vTStop` with a proportional refund; a crossing buy is capped, not overshot.

**Derivation** — guard-lift: `CurveMath.buy` :92 `if (newVT <= vTStop)` caps `r.newVT = vTStop`, `stockUsed = divUp(k,vTStop) - vS`; caller refunds `gross - stockUsed - feeUsed - taxUsed` `COURCurve.sol:130`.

**If violated** — over/under-charged graduation buy; refund arithmetic underflow.

---

#### I-11

`Temporal` · On-chain: **Yes**

> Launch tax decays deterministically over `[launchedAt, launchedAt+5s)`: `9900·(5−dt)^6/5^6` bps, zero after 5s, max at/under launch second.

**Derivation** — temporal: `LaunchTax.taxBps` :16-26 compares `nowTs - launchedAt` against `LAUNCH_TAX_WINDOW`; `_launchedAt` snapshotted once at launch (`TokenConfig` :122).

**If violated** — anti-snipe window shifts; early buyers under/over-taxed.

---

#### I-12

`Conservation` · On-chain: **No**

> Vault stock balance per stock == `Σ creatorOwed + Σ buybackOwed + Σ holder-pending + platformOwed` (±dust).

**Derivation** — Δ-pair: every `notify` increments exactly one creator bucket + `platformOwed` from stock already transferred in (`COURFeeVault.sol:127-141`); claims (`claim` :196, `claimHolder` :208, `claimPlatform` :217, `executeBuyback` :295) decrement and transfer out. The HOLDERS branch distributes via `accPerShare` (`notify` :133) rather than a scalar, so the sum is only approximate (rounding dust) and is not asserted anywhere on-chain.

**If violated** — a claim path could draw stock owed to another bucket/holder.

---

#### I-13

`Conservation` · On-chain: **No**

> HOLDERS dividends: `Σ holder claimable ≤ Σ distributed creatorSide` (per token).

**Derivation** — Δ-pair: `accPerShare += creatorSide·ACC_PRECISION / eligibleSupply` `COURFeeVault.sol:133`; per-holder `accumulated = balance·accPerShare/ACC_PRECISION` (`_accrue` :177, `_settleToNewBalance` :168). Integer division floors each accrual, so the sum is ≤ distributed; not asserted on-chain and depends on `eligibleSupply` tracking (see I-14).

**If violated** — dividend over-distribution would let late claimers drain stock owed to others.

---

#### I-14

`Conservation` · On-chain: **No**

> `t.eligibleSupply == Σ balanceOf(h)` over all dividend-eligible holders (excludes 0, DEAD, vault, router, PM, curve).

**Derivation** — Δ-pair: `beforeBalanceChange` adjusts `eligibleSupply` by `amount` only on eligibility transitions (`COURFeeVault.sol:161-162`); relies on the token calling it BEFORE every `_update` (`COURToken.sol:53-58`) and on `_eligible` :183 matching the exclusion set. No on-chain reconciliation against real balances.

**If violated** — `accPerShare` denominator drifts; dividends mis-weighted (over- or under-paid).

---

#### I-15

`Bound` · On-chain: **No**

> `k = vS0·vT0` fits in uint256 for all launch params.

**Derivation** — guard-lift: `k` computed as a plain `uint256` multiply `CurveMath.sol:63` with NO overflow bound check; relies solely on admin `setLaunchParams` staying within sane ranges (RISKS.md §Decimal/price extremes). Pathological `startMcUsd`/price/decimals combinations could overflow.

**If violated** — launch reverts (best case) or wraps (if unchecked math path existed); DoS on affected stock.

---

#### I-16

`Temporal` · On-chain: **Yes**

> Hook tick accumulator advances monotonically and only when `block.timestamp` strictly increases; a two-anchor rolling scheme yields a ~[300s,600s] TWAP window.

**Derivation** — temporal: `_updateObs` :277 `if (nowTs > o.lastTs)` accumulates `lastTick·dt`, rolls anchor at `>= HOOK_TWAP_WINDOW` :280; `consult` :292 / `priceInfo` :306 read `(cumNow − refCum)/span`.

**If violated** — buyback deviation guard reads a wrong/fresh-biased mean tick.

---

#### I-17

`Bound` · On-chain: **Yes**

> Hook address carries exactly the five implemented permission bits (beforeInitialize, beforeSwap, afterSwap, +both return-delta flags).

**Derivation** — guard-lift: constructor `COURHook.sol:79` `if ((uint160(this) & ALL_HOOK_MASK) != flags) revert BadPoolKey()`; flags built from `getHookPermissions` :83.

**If violated** — v4 would invoke unimplemented hook callbacks or skip fee capture.

---

#### I-18

`Bound` · On-chain: **Yes**

> `twapWindow >= 60s` for all price reads.

**Derivation** — guard-lift: `require(w >= 60, "window")` `COURPriceReader.sol:55`; `twapWindow` initialized to `TWAP_WINDOW` (1800) :27 and only written here.

**If violated** — a too-short window would make the stock USD TWAP cheaply manipulable.

---

**Categories:** Conservation (Δ equal-and-opposite) · Bound (guard lifted to all write sites) · Ratio (formula of storage vars) · StateMachine (guarded transition) · Temporal (timestamp/duration dependent).

---

## 3. Inferred Invariants (Cross-Contract)

#### X-1

On-chain: **Yes**

> Factory pulls exactly the curve's full stock + token balance at graduation, matching what the curve pre-approved.

**Caller side** — `COURFactory.sol:170-173` — reads `balanceOf(curve)` for both assets and `safeTransferFrom(curve, factory, …)`.

**Callee side** — `COURCurve.sol:190-193` (`_graduate`) — `forceApprove(factory, stockRaised)` / `forceApprove(factory, tokenLeftover)` for the same balances immediately before calling `factory.graduate`.

**If violated** — graduation would revert (insufficient allowance) or leave residual funds on the curve.

---

#### X-2

On-chain: **Yes**

> Delegatecalled `GraduationImpl` declares NO storage variables, so it cannot corrupt the factory's storage layout when run in the factory's context.

**Caller side** — `COURFactory.sol:178-192` — `graduationImpl.delegatecall(abi.encodeCall(GraduationImpl.graduate, …))` executes in factory storage with `address(this) == factory`.

**Callee side** — `GraduationImpl.sol:28-101` — contract body declares only a `struct` and functions; zero state variables (enforced by the documented "MUST declare NO storage variables" contract :27).

**If violated** — any impl storage write would clobber factory slots (immutables are fine; mappings/params would corrupt).

---

#### X-3

On-chain: **Yes**

> Only the wired hook or a token's registered curve can credit fees; the vault trusts `msg.sender` identity, set once via `wire`/`registerToken`.

**Caller side** — `COURCurve.sol:147,179` and `COURHook.sol:169,201,216` — call `vault.notify(token, fee)` after transferring stock in.

**Callee side** — `COURFeeVault.sol:119-122` — `notify` checks `t.registered` and `msg.sender ∈ {hook, t.curve}`; `hook` set once in `wire` (I-6), `t.curve` set once in `registerToken` from `factory.curveOf` (I-7).

**If violated** — forged accrual would let an attacker mint owed balances against real stock held by the vault.

---

#### X-4

On-chain: **No**

> The vault's buyback deviation guard assumes the hook TWAP (`priceInfo`) and `poolStockReserve` reflect the live graduated pool.

**Caller side** — `COURFeeVault.sol:300-303` (`_checkDeviation`) and :285 (`_poolStockReserve`) — gate `executeBuyback` on `priceInfo`/`poolStockReserve`.

**Callee side** — `COURHook.sol:306-355` — `priceInfo`/`poolStockReserve` derive from `poolManager.getSlot0`/`getLiquidity` + the hook's own accumulator; the spot vs. its own short-window TWAP is self-referential, and `poolStockReserve` is a best-effort full-range estimate (RISKS.md §buyback reserve cap).

**If violated** — a within-guard spot manipulation could still let a buyback execute at a skewed price (bounded by 2%-reserve + minTokensOut).

---

#### X-5

On-chain: **No**

> Launch curve pricing assumes `priceReader.stockUsd` returns a fair, manipulation-resistant USD price at `createToken` time.

**Caller side** — `COURFactory.sol:100,114` — `stockUsd(stock)` feeds `CurveMath.computeLaunchParams` (fixes vS0/k for the token's life).

**Callee side** — `COURPriceReader.sol:68-89` — a single v3 TWAP (USDG direct or STOCK/WETH×WETH/USDG) over `twapWindow`; freshness relies on pre-launch `bumpCardinality`, and only the thin-pool floor (G-7) bounds depth. The v3 pool itself is out of scope but the reader logic is in scope.

**If violated** — a manipulated launch TWAP permanently mis-sets the curve's start price and graduation threshold.

---

## 4. Economic Invariants

#### E-1

On-chain: **No**

> Graduation opens a balanced full-range LP: leftover tokens valued at the stop price exactly equal the real stock raised.

**Follows from** — `I-2` + `I-9` + `I-10` (curve solvency + x·y=k + exact stop cap). The identity is a proven math property (CurveMath.t.sol) but is NOT asserted at graduation; `GraduationImpl` mints with whatever balances arrive and sweeps dust (`GraduationImpl.sol:61-94`).

**If violated** — the graduated pool opens off-ratio, creating an immediate arbitrage gap against the burned LP.

---

#### E-2

On-chain: **Yes**

> Admin can never redirect or extract funds owed to an existing token's creator, holders, buyback, or LP.

**Follows from** — `I-3` + `I-5` + `I-7` + `G-22` (immutable fee/mode, one-shot init/registration, recipient-only claims); admin surface is confined to future-launch params and treasury/min-buyback (COURFactory admin setters, `COURFeeVault.setTreasury`).

**If violated** — the core "admin cannot rug existing tokens" guarantee breaks.

---

#### E-3

On-chain: **No**

> Total value claimable across all vault buckets for a stock never exceeds stock actually delivered to the vault.

**Follows from** — `I-8` + `I-12` + `I-13` + `I-14` (exact split + bucket conservation + dividend ≤ distributed + eligible-supply accuracy). The chain includes three On-chain=No links (I-12/13/14), so the aggregate solvency of the vault is not on-chain-enforced.

**If violated** — a claim path overdraws, leaving another party's owed stock unpayable.
