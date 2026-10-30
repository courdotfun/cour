# X-Ray Report

> COUR Phase 1 | 1810 nSLOC | 7bbb56f (`master`) | Foundry | 31/10/26

Analyzed branch: `master` at `7bbb56f`.

---

## 1. Protocol Overview

**What it does:** A pump.fun-style token launchpad on Robinhood Chain where every token trades on a virtual constant-product bonding curve priced in a Robinhood **stock token** (ERC-20 + ERC-8056), then graduates in-tx at sell-out into a Uniswap v4 pool with a custom fee hook and burned LP.

- **Users**: Creators (launch tokens, pick fee 1-10% + a creator mode), Traders (buy/sell via curve then pool), token Holders (HOLDERS-mode dividends).
- **Core flow**: `createToken` → curve trading → auto-`graduate` into a v4 pool → fee capture via the hook.
- **Key mechanism**: x·y=k virtual curve (reserves `vS`/`vT`, `k` fixed at launch from a v3 TWAP USD price); graduation mints a balanced full-range LP as a v4 PositionManager NFT sent to `0x…dEaD`.
- **Token model**: Fixed 1e9/18-dec ERC20 minted once to the curve; paired stock token is the quote asset and the fee denomination; USDG/WETH used only for pricing and the ETH-in path.
- **Admin model**: `Ownable2Step` (deployer EOA now; intended 48h Timelock + Safe). Admin gates only FUTURE launches and platform config — it cannot touch an existing token's fee, mode, recipient, balances, trading, or graduated LP.

For a visual overview, see the [architecture diagram](architecture.svg).

### Contracts in Scope

| Subsystem | Key Contracts | nSLOC | Role |
|-----------|--------------|------:|------|
| Launch & graduation | COURFactory, GraduationImpl | 283 | Validates/launches tokens; delegatecalls the stateless graduation (pool init + LP-to-DEAD) |
| Bonding curve | COURCurve, CurveMath, LaunchTax | 285 | Per-token clone; buy/sell/graduate, anti-snipe tax, curve-favouring math |
| v4 integration | COURHook, PoolManagerSwapper, PoolKeyLib | 367 | Fee capture on pool swaps, tick-accumulator TWAP, pool gating, direct `unlock` swaps |
| Fees & rewards | COURFeeVault | 255 | Custody/routing of the creator fee, 4 modes, dividends, buyback, claims |
| Pricing | COURPriceReader, V3Oracle | 141 | Oracle-free USD pricing from v3 TWAPs (USDG direct / STOCK-WETH-USDG) |
| Token | COURToken | 41 | Fixed-supply ERC20+Permit; HOLDERS-mode balance-change hook |
| Routing | COURRouter | 143 | Single frontend entrypoint; routes curve↔pool; holds no funds; ETH-in path |
| Shared | Constants, Errors, Events, types/* | ~137 | Constants, custom errors, events, enums/structs |

### How It Fits Together

The core trick: a token's entire economic life is defined once at launch — the v3 TWAP stock price fixes `vS0`/`k`/`vTStop` so that, at sell-out, the leftover tokens valued at the stop price *exactly* equal the raised stock, letting graduation open a perfectly balanced full-range LP that is then burned.

### Launch

```
Creator → COURFactory.createToken()
 ├─ priceReader.refLiquidityUsd() / stockUsd()   // v3 TWAP; thin-pool floor
 ├─ LibClone.clone(curveImpl)                     // EIP-1167 curve clone
 ├─ new COURToken{salt}  → _mint(curve, 1e9e18)   // whole supply to curve
 ├─ CurveMath.computeLaunchParams()               // vS0, vT0, k, vTStop (immutable)
 ├─ curve.initialize(cfg) ; feeVault.registerToken()
 └─ [optional] curve.initialBuy()                 // fee, NO tax, cannot graduate
```
*All per-token parameters are snapshotted here and never re-read from the oracle again.*

### Trade → Graduation (atomic)

```
Trader → COURCurve.buy()
 ├─ LaunchTax.taxOn() + fee  → net                // anti-snipe decays over 5s
 ├─ CurveMath.buy(net)       → caps at vTStop
 ├─ stock.transferFrom(payer) ; token.transfer(to)
 ├─ fee → FeeVault.notify()
 └─ if graduates → _graduate()
      → forceApprove(factory) ; factory.graduate()
        → GraduationImpl.graduate() [DELEGATECALL, runs as factory]
          ├─ PoolManager.initialize(key, sqrtPrice@stopRatio)
          ├─ PositionManager.modifyLiquidities(MINT → DEAD) via Permit2
          └─ sweep dust: tokens→DEAD, stock→platform bucket
```
*Graduation runs in the factory's storage context so the hook sees `sender == factory`; LP ownership = DEAD = irremovable.*

### Post-graduation trade + fee capture

```
Trader → COURRouter.buy() → PoolManager.unlock() → _pm.swap()
 └─ COURHook.beforeSwap()  (buy: take stock fee + tax via BeforeSwapDelta)
    COURHook.afterSwap()   (sell: take stock fee via return delta)
      → poolManager.take(stock, feeVault) → FeeVault.notify()
```
*Fee is ALWAYS denominated in the stock token, both directions; vault-originated buyback swaps are exempt.*

### Fee routing & dividends

```
FeeVault.notify(fee) → platform = floor(20%) ; creatorSide = rest
 ├─ CREATOR      → creatorOwed      → claim()        (feeRecipient)
 ├─ HOLDERS      → accPerShare      → claimHolder()  (per holder, O(1))
 └─ BUYBACK(_BURN) → buybackOwed    → executeBuyback() (feeRecipient, guarded)
COURToken._update → feeVault.beforeBalanceChange()   // HOLDERS: settle before move
```

---

## 2. Threat & Trust Model

### Protocol Threat Profile

> Protocol classified as: **DEX/AMM (bonding curve + v4 pool)** with **Launchpad** and **oracle-dependent-pricing** characteristics.

Signals: constant-product `x·y=k` math, `swap`/`buy`/`sell`, `sqrtPriceX96`/tick/LP mint-burn, a v4 hook, plus one-shot per-token launch + graduation lifecycle and v3-TWAP USD pricing. The dominant adversaries are AMM/curve-math and MEV attackers; the launch phase and the TWAP price feed add first-trade and oracle-manipulation surfaces.

### Actors & Adversary Model

| Actor | Trust Level | Capabilities |
|-------|-------------|-------------|
| Admin / Owner | Bounded (deployer EOA now; intended 48h Timelock + Safe) | Instant: `setStock`, `setLaunchParams`, `setLaunchesPaused`, allowlist toggles, `setTreasury`, `setMinBuybackUsd`, PriceReader config, router ETH path. CANNOT touch existing-token fee/mode/recipient/balances/trading/LP. No pause on trading or claims. |
| Creator | Bounded (per own token only) | Set fee (1-10%) + mode at launch; claim CREATOR fees; trigger BUYBACK; rotate feeRecipient (two-step). |
| Trader | Untrusted | `buy`/`sell`/`buyWithETH` via router or curve; permissionless. |
| Holder | Untrusted | `claimHolder` dividends (HOLDERS mode). |
| Curve (clone) | Bounded (code-derived) | Sole caller of `factory.graduate`; `notify`s fees. |
| Hook | Bounded (code-derived) | Sole/paired caller of `notify`; captures pool fees; only PoolManager invokes it. |
| PoolManager / PositionManager / Permit2 / v3 pools | Trusted (fork-verified on mainnet 2026-10-29) | Execute swaps, mint LP, pull liquidity, serve TWAP observations. |

**Adversary Ranking:**

1. **Curve/graduation math attacker** — targets the x·y=k rounding, refund arithmetic, and the balanced-LP identity at the pricing boundary.
2. **Launch-TWAP manipulator** — moves the reference v3 pool to mis-set a token's permanent start price / graduation threshold.
3. **MEV / sandwich searcher** — exploits curve buys, the atomic graduation buy, and post-graduation pool swaps.
4. **Dividend-accounting gamer** — manipulates HOLDERS `eligibleSupply`/`accPerShare` via transfer timing.
5. **Fee-accrual forger** — attempts to call `notify`/`graduate` outside the hook/curve trust path.

See [entry-points.md](entry-points.md) for the full permissionless entry point map.

### Trust Boundaries

- **Admin seat** — `Ownable2Step` two-step transfer only; no operational timelock yet (deployer EOA). Worst instant action is `setLaunchParams`/`setStock` affecting FUTURE launches; existing tokens are provably untouchable (E-2). *Git signal: COURFactory is the #1 hotspot (6 mods, top fix-scored commit).*
- **Curve → Factory graduation** &nbsp;&#91;[X-1](invariants.md#x-1), [X-2](invariants.md#x-2)&#93; — `factory.graduate` trusts `msg.sender == curveOf[token]` (G-9); the delegatecall into `GraduationImpl` trusts that the impl has zero storage.
- **Vault accrual path** &nbsp;&#91;[X-3](invariants.md#x-3), [I-6](invariants.md#i-6)&#93; — `notify`/`creditPlatform` trust the one-time-wired hook and the per-token registered curve; a mis-wire would open fee forgery.
- **Price feed** &nbsp;&#91;[X-5](invariants.md#x-5), [I-18](invariants.md#i-18)&#93; — launch and buyback math trust single v3 TWAPs; only the thin-pool floor + ≥60s window bound manipulability; no third-party oracle fallback.

### Key Attack Surfaces

- **`GraduationImpl` delegatecall storage safety** &nbsp;&#91;[X-2](invariants.md#x-2)&#93; — `COURFactory.sol:178` runs `GraduationImpl.graduate` in factory storage; worth confirming the impl declares zero storage slots (it does at `GraduationImpl.sol:28`) and that future edits never add state, since any write would land on factory slots.

- **`GraduationImpl.graduate` is externally callable with no access control** — `GraduationImpl.sol:43`; worth confirming that a direct (non-delegatecall) call on the deployed impl is inert — it operates on the impl's own empty balances and a COUR-hook pool init reverts on `sender != factory`, but trace the Permit2/PositionManager interactions for any griefing or approval residue.

- **Graduation balanced-LP identity is unchecked on-chain** &nbsp;&#91;[E-1](invariants.md#e-1), [I-10](invariants.md#i-10)&#93; — `GraduationImpl.sol:48-67` mints liquidity from whatever balances arrive; the leftover==raised identity is proven in tests, not asserted. Worth tracing the `sqrtPrice` encoding (X128, `GraduationImpl.sol:53-54`) and `getLiquidityForAmounts` rounding for off-ratio pool openings, especially low-decimal stock.

- **Curve buy refund & stop-cap arithmetic** &nbsp;&#91;[I-10](invariants.md#i-10), [I-9](invariants.md#i-9)&#93; — `COURCurve.sol:126-132` computes proportional `feeUsed`/`taxUsed` and `refund = gross - stockUsed - feeUsed - taxUsed`; worth confirming the subtraction cannot underflow at the exact stop boundary across fee/tax extremes.

- **Launch TWAP manipulation sets permanent curve params** &nbsp;&#91;[X-5](invariants.md#x-5)&#93; — `COURFactory.sol:100` + `COURPriceReader.sol:68`; a single v3 TWAP fixes `vS0`/`k` for the token's life. Worth checking the floor (G-7) and `twapWindow` are sufficient for the thinnest allowed reference pool.

- **HOLDERS eligibleSupply / accPerShare accounting** &nbsp;&#91;[I-13](invariants.md#i-13), [I-14](invariants.md#i-14)&#93; — `COURFeeVault.sol:149-172`; `eligibleSupply` is maintained incrementally from token-reported transitions and the `_eligible` exclusion set. Worth tracing mint/burn/self-transfer/excluded-address edges for denominator drift.

- **Vault bucket solvency not asserted on-chain** &nbsp;&#91;[I-12](invariants.md#i-12), [E-3](invariants.md#e-3)&#93; — `COURFeeVault.sol`; creator/buyback/holder/platform buckets share one stock balance per stock with no aggregate check. Worth confirming no claim path can draw another bucket's stock.

- **Buyback deviation guard is self-referential** &nbsp;&#91;[X-4](invariants.md#x-4), [I-16](invariants.md#i-16)&#93; — `COURFeeVault.sol:299-304` compares pool spot to the hook's own ~5-min accumulator; worth checking the two-anchor rollover (`COURHook.sol:274-303`) cannot be freshly biased within a block to pass the 3% gate.

- **Hook fee math on `take`/BeforeSwapDelta** &nbsp;&#91;[I-17](invariants.md#i-17)&#93; — `COURHook.sol:160-204`; fee is taken from input (buy) or output (sell) and returned as a delta. Worth confirming the sign/branch for both token orderings (`tokenIsZero`) and that `poolManager.take` to the vault reconciles with the returned delta.

- **ERC-8056 / weird-stock handling** — stock decimals read dynamically and raw-unit accounting throughout; worth confirming no path assumes 18 decimals and that a paused/blacklisting stock only reverts the single affected transfer (per RISKS.md), never corrupting accrual.

### Upgrade Architecture Concerns

No proxy/UUPS upgradeability. `GraduationImpl` is a fixed immutable delegatecall target set in the factory constructor (`COURFactory.sol:83`) — not upgradeable, but it is the one contract whose storage discipline the factory's integrity depends on (X-2). Curve clones use EIP-1167 (LibClone) pointing at a fixed implementation.

### Protocol-Type Concerns

**As a DEX/AMM / bonding curve:**
- `CurveMath` rounds consistently via `divUp` toward the curve (`CurveMath.sol:90,121`); worth confirming the direction is correct on *both* buy and sell so dust always favours solvency (I-2), never the trader.
- `k = vS0·vT0` is a single unchecked uint256 multiply (`CurveMath.sol:63`, I-15); pathological admin params × extreme price could overflow — relies on admin discipline, not a bound.
- Graduation `sqrtPriceX96 = sqrt(ratioX128) << 32` (`GraduationImpl.sol:53-54`) — a prior fuzz-found overflow for low-decimal stock was fixed here; worth re-checking the X128 path bounds.

**As a Launchpad:**
- Empty/first-trade state: `createToken` can include an atomic `initialBuy` capped at 50% supply and barred from graduating (G-8); worth confirming the launch second cannot be sniped (99% tax, G-14).

**As oracle-dependent:**
- `stockUsd` has no staleness/deviation bound beyond TWAP window + thin-pool floor; a STOCK/WETH route multiplies two TWAPs (`COURPriceReader.sol:83-85`), compounding manipulation surface.

### Temporal Risk Profile

**Deployment & Initialization:**
- Nonce-predicted factory address + CREATE2-mined hook: deploy ordering is load-bearing (`script/DeployCore.s.sol`); a mis-ordered `wire()` (one-shot, I-6) or wrong hook salt would require redeploy. Worth confirming wiring happened correctly post-deploy.
- Live on mainnet unaudited, mitigated by the enabled launch allowlist (G-3) and deployer-only ownership (RISKS.md) — an accepted closed-test posture, not a code flaw.

**Market Stress:**
- Buyback guards (2%-reserve + 3%-deviation + min-USD) assume a functioning TWAP; a stock pool with stale observations reverts `TwapNotReady` rather than failing open — fail-closed, good.

### Composability & Dependency Risks

**Dependency Risk Map:**

> **Uniswap v4 PoolManager / PositionManager** — via `GraduationImpl`, `COURHook`, `PoolManagerSwapper`
> - Assumes: Cancun/transient storage, standard `initialize`/`swap`/`modifyLiquidities`/`take`/`settle` semantics
> - Validates: hook permission bits (I-17), `unlockCallback` caller == PM (G-24)
> - Mutability: canonical immutable deployments (fork-verified)
> - On failure: reverts (atomic)

> **v3 reference pools** — via `COURPriceReader` / `V3Oracle`
> - Assumes: sufficient observation cardinality; TWAP reflects fair USD price
> - Validates: thin-pool floor (G-7), window ≥60s (I-18); reverts `TwapNotReady` on missing history
> - Mutability: external pools, not controlled by COUR
> - On failure: fail-closed (revert)

> **Permit2** — via `GraduationImpl._permit2Approve`
> - Assumes: canonical singleton at the hardcoded address; `approve(token,spender,amount,expiry)` semantics
> - Validates: NONE (address hardcoded, `Constants.sol:56`)
> - Mutability: immutable singleton
> - On failure: reverts

> **SwapRouter02 (v3) / WETH** — via `COURRouter.buyWithETH`
> - Assumes: `exactInput(path)` with admin-set fee tiers; WETH deposit/approve
> - Validates: `PathNotConfigured` if unset; final `minOut` enforced on the COUR buy, not the v3 hop
> - Mutability: external; path is admin-configured per stock
> - On failure: reverts; all residuals refunded (router holds nothing)

**Token Assumptions** *(unvalidated only)*:
- Stock token: assumes transfer moves the exact amount (no fee-on-transfer) — curve uses internal `vS` accounting (immune to donation/inflation) but a fee-on-transfer stock would desync `balanceOf(curve)` vs `vS - vS0` (I-2). RISKS.md states stock tokens are standard ERC-20 raw-unit; confirm no fee-on-transfer stock is allowlisted.
- Stock blacklist/pause: a single claim can revert; accrual (`notify`) never moves stock so cannot corrupt (per spec).

**Shared State Exposure:**
- The reference v3 pools used for `stockUsd` are shared public pools; a large swap there by anyone moves COUR's launch pricing for any launch in the same block.

---

## 3. Invariants

> ### 📋 Full invariant map: **[invariants.md](invariants.md)**
>
> A dedicated reference file contains the complete invariant analysis — do not look here for the catalog.
>
> - **24 Enforced Guards** (`G-1` … `G-24`) — per-call preconditions with Check / Location / Purpose
> - **18 Single-Contract Invariants** (`I-1` … `I-18`) — Conservation, Bound, Ratio, StateMachine, Temporal
> - **5 Cross-Contract Invariants** (`X-1` … `X-5`) — caller/callee pairs across scope boundaries
> - **3 Economic Invariants** (`E-1` … `E-3`) — higher-order properties from `I-N` + `X-N`
>
> The **On-chain=No** blocks (I-12, I-13, I-14, I-15, X-4, X-5, E-1, E-3) are the high-signal ones — each is simultaneously an invariant and a potential bug. Attack-surface bullets above cross-link into the relevant blocks.

---

## 4. Documentation Quality

| Aspect | Status | Notes |
|--------|--------|-------|
| README | Present | `README.md` |
| NatSpec | ~27 annotations (enumeration) | Thorough on externals and libraries; `@inheritdoc` used consistently |
| Spec/Whitepaper | Present | `docs/SPEC.md` (source of truth), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/AUDIT_SCOPE.md`, `docs/RISKS.md`, `docs/CHAIN_FACTS.md` |
| Inline Comments | Thorough | Dense rationale comments explaining rounding direction, delegatecall context, TWAP scheme, lint suppressions |

Spec-stated claims (tagged `(per spec)` where used): 9 enumerated invariants in AUDIT_SCOPE.md; the "admin cannot rug existing tokens" guarantee; the leftover==raised balanced-LP identity. All are code-verifiable in scope.

---

## 5. Test Analysis

| Metric | Value | Source |
|--------|-------|--------|
| Test files | 28 | File scan (reliable) |
| Test functions | 103 | File scan (reliable) |
| Line coverage | Unavailable — `forge coverage` fails `stack too deep` without via_ir; `--ir-minimum` retry runs too long on the full v4 tree | Coverage tool |
| Branch coverage | Unavailable — same reason | Coverage tool |

### Test Depth

| Category | Count | Contracts Covered |
|----------|-------|-------------------|
| Unit + Integration | ~97 | broad (curve math, launch tax, fee modes, admin, pricereader, hook views, vault, router, graduation) |
| Fork | 2 | real v4 PoolManager/PositionManager + NVDA/USDG TWAP on mainnet |
| Stateless Fuzz | 4 | curve math, launch tax, pricereader |
| Stateful Fuzz (Foundry invariant) | 4 | solvency / supply / vault buckets / admin |
| Stateful Fuzz (Echidna/Medusa) | 0 | none |
| Formal Verification (Certora/Halmos/HEVM) | 0 | none |

### Gaps

- **No formal verification** — the curve math, graduation identity (E-1), and vault bucket solvency (E-3, I-12) are math-heavy and would benefit most from Halmos/Certora; highest-priority gap given the unasserted On-chain=No conservation invariants.
- **No Echidna/Medusa** — the 4 Foundry invariants are a good start; cross-mode fee/dividend accounting (I-13/I-14) warrants external stateful fuzzing of HOLDERS transfer sequences.
- Coverage % must be produced by the human before audit (run with the project's `via_ir` profile, not the default coverage path).

---

## 6. Developer & Git History

> Repo shape: normal_dev — 14 of 36 commits touch source, over a 4-day span (2026-10-27 → 2026-10-31). Short, intense single-author build.

### Contributors

| Author | Commits | Source Lines (+/-) | % of Source Changes |
|--------|--------:|--------------------|--------------------:|
| COUR Engineer | 36 | +2863 / -313 | 100% |

### Review & Process Signals

| Signal | Value | Assessment |
|--------|-------|------------|
| Unique contributors | 1 | Single-dev — no peer review |
| Merge commits | 0 of 36 | No PR/merge workflow — likely no code review |
| Repo age | 2026-10-27 → 2026-10-31 | 4 days |
| Recent source activity (30d) | 14 source commits | Active burst (entire history is recent) |
| Test co-change rate | 57.1% | 57% of source-touching commits also modified tests (co-modification, not coverage) |

### File Hotspots

| File | Modifications | Note |
|------|-------------:|------|
| src/COURFactory.sol | 6 | Highest churn — launch/graduation/allowlist all landed here; prioritize review |
| src/COURFeeVault.sol | 4 | Fee/dividend/buyback accounting |
| src/COURCurve.sol | 4 | Curve math + anti-snipe guard |
| src/COURHook.sol | 3 | Fee capture + TWAP |
| src/libraries/Events.sol, Errors.sol | 4 / 3 | Grew with features |

### Security-Relevant Commits

| SHA | Date | Subject | Score | Key Signal |
|-----|------|---------|------:|------------|
| 8c9d385 | 2026-10-29 | fix(factory): move graduation to delegatecalled GraduationImpl (EIP-170) | 15 | bug fix + auth + accounting + token transfer; focused, with tests |
| 1947e2d | 2026-10-27 | fix graduation sqrtPrice overflow for low-decimal stock | 14 | explicit security language + oracle/pricing + accounting |
| 2e04b50 | 2026-10-29 | feat(router): buyWithETH v3 multi-hop | 9 | adds guards + tightens access + token transfer |
| f18058a | 2026-10-29 | graduate LP as v4 position NFT to DEAD | 8 | auth + accounting + net code removal |

### Dangerous Area Evolution

Highest-signal recent changes concentrate in fund-flow + accounting code: the graduation rewrite (delegatecall split, LP-to-DEAD) and the sqrtPrice overflow fix both touched the factory/curve fund path within the last 3 days.

### Forked Dependencies

| Library | Path | Upstream | Status | Notes |
|---------|------|----------|--------|-------|
| openzeppelin-contracts | lib/openzeppelin-contracts | OpenZeppelin | Internalized (not submodule) | v5.1.0 per docs; many mixed pragmas (vendored tree) |
| solady | lib/solady | Solady | Internalized | Mixed pragmas (vendored tree) |
| v4-periphery (+ v4-core, permit2) | lib/v4-periphery | Uniswap | Vendored tree | v1.0.2 per docs |

Dependencies are gitignored and restored via `bootstrap.sh`; the "internalized" flag reflects local vendoring, not divergence from upstream — confirm pins match the stated versions.

### Technical Debt Markers

None detected (`tech_debt.total_count = 0`). Lint suppressions (`unsafe-typecast`, `block-timestamp`, `divide-before-multiply`) are intentional and documented in DECISIONS.md.

### Security Observations

- **Single-developer, zero-review** — 100% by one author, 0 merge commits; all review burden falls on the audit.
- **Factory is the churn + risk nexus** — 6 mods and the two highest fix-scored commits (graduation delegatecall, sqrtPrice overflow) live here.
- **Last-minute fund-flow changes** — the delegatecall graduation split (score 15) landed 2 days before the analysis snapshot.
- **Fix-without-test rate 40%** — some security-relevant commits lacked co-changed tests (co-modification metric, not coverage).
- **Live unaudited on mainnet** — accepted closed-test risk, gated by the launch allowlist (RISKS.md).
- **No formal verification** for math-heavy curve/vault logic with several unasserted conservation invariants.

### Cross-Reference Synthesis

- **COURFactory is #1 in churn AND attack-surface priority** → highest-leverage review targets: `graduate`/delegatecall (X-2), `createToken` launch pricing (X-5), and the balanced-LP identity (E-1).
- **sqrtPrice overflow fix (1947e2d) aligns with the graduation math surface** → the X128 encoding at `GraduationImpl.sol:53-54` is the patched spot; re-verify low-decimal bounds.
- **Delegatecall rewrite (8c9d385, score 15) is the newest, most dangerous change** → storage-layout discipline (X-2) is the single assumption holding factory integrity together.

---

## X-Ray Verdict

**ADEQUATE** — Comprehensive unit + fuzz + invariant + fork tests and thorough docs/NatSpec, but single-developer with no peer review, no formal verification, no operational timelock, and several economically-critical conservation invariants unasserted on-chain.

**Structural facts:**
1. 1810 nSLOC across 8 subsystems; 8 protocol contracts + 7 libraries, no proxy upgradeability.
2. 28 test files / 103 test functions incl. 4 stateless-fuzz, 4 Foundry invariants, 2 fork tests; 0 formal verification; coverage % unavailable in this environment.
3. One developer authored 100% of source across 36 commits over 4 days with 0 merge commits.
4. Access control is `Ownable2Step` on 4 contracts with no operational timelock yet; admin scope is confined to future launches (proven untouchable for existing tokens).
5. One delegatecall relationship (Factory → stateless GraduationImpl) and one externally-callable unprotected impl function are the structurally unusual elements.
