# COUR — Auditor Brief (Phase 1)

> For the external auditor. Companion to `AUDIT_SCOPE.md` (file list, nSLOC, scope-vs-deployment diff),
> `audit/FINDINGS.md` (automated findings), `audit/XRAY.md`, and `RISKS.md`.
> **Freeze:** git tag `audit-freeze-v1` (source freeze = commit `458c358`; later commits are docs only).
> **Chain:** Robinhood Chain, chainId 4663. Solidity 0.8.26, `via_ir=true`, `optimizer_runs=44444444`,
> `evm_version=cancun`.

## 1. What the product is
COUR is a permissionless launchpad for tokens priced against **Robinhood stock tokens** (ERC-8056-aware;
e.g. NVDA). A creator launches an ERC20 with a **fixed 1,000,000,000 supply** minted once to a bonding
**curve**. Users buy/sell on the curve (constant-product `x·y=k`, denominated in the stock token) until the
market cap reaches the graduation threshold. At **graduation** the raised stock + the unsold tokens are
deposited as a **full-range Uniswap v4 position whose LP NFT is sent to `0xdead` (burned)**, and the curve is
permanently closed. Trading fees (1%–10%, creator-chosen) are split **80% creator-side / 20% platform** and
routed by one of four immutable **creator modes**: `CREATOR` (claimable), `HOLDERS` (pro-rata dividends to
holders), `BUYBACK`, `BUYBACK_BURN`.

Key economic constants: start/grad market cap default **$4,000 → $60,000** (ratio Q=15), launch anti-snipe
**tax window 5s @ 99% decaying**, max initial creator buy **50% of supply**, buyback guards **min $50 /
≤2% of pool per call / ≤3% TWAP deviation**, reference-pool USD-liquidity launch floor **$50,000**.

## 2. Architecture (contracts in scope)
- **COURFactory** — launch + graduation orchestration, launch allowlist, admin params. Graduation mechanics
  are **delegatecalled** into `GraduationImpl` (factory was over EIP-170; split to stay under the limit).
- **GraduationImpl** — runs *in the factory's context via delegatecall*. Initializes the v4 pool, mints the
  full-range position through the real **PositionManager** (`MINT_POSITION`+`SETTLE_PAIR`, Permit2), owner =
  `DEAD`. Opening price & LP amounts come from **curve internal accounting** (`vS0/vT0/vTStop/k`), not
  balances; donated excess is swept (stock→platform, tokens→DEAD). Declares **no mutable storage**
  (delegatecall-safe) and guards against direct calls (`OnlyDelegatecall`).
- **COURCurve** (clone per token) — buy/sell, fee + launch-tax application, refund of over-payment, triggers
  graduation. All math in `CurveMath` (rounding always favours the curve; uses internal virtual reserves
  `vS/vT`, never `balanceOf`).
- **COURToken** — fixed-supply ERC20 + Permit; in HOLDERS mode calls `vault.beforeBalanceChange` on transfers.
- **COURFeeVault** — custody/routing of fees, four modes, HOLDERS dividend accounting, buyback execution and
  claims. Holds the **shared stock balance** backing creator/holder/platform buckets.
- **COURHook** — v4 hook: captures the fee on pool swaps, maintains a two-anchor tick-accumulator TWAP, gates
  pool initialization (only the factory, `fee==0`, `tickSpacing==60`, currency pairing).
- **COURPriceReader** — oracle-free USD pricing from Uniswap **v3 TWAPs** (STOCK/USDG or STOCK/WETH→WETH/USDG),
  plus the reference-liquidity floor (now from in-range reserves).
- **COURRouter** — unified front door for curve/pool buy/sell and buyWithETH (v3 multi-hop); holds no funds.
- **PoolManagerSwapper** — shared base for v4 swaps via the PoolManager `unlock` callback (the protocol never
  routes through the forked Universal Router).

## 3. Trust assumptions
- Uniswap v4 PoolManager/PositionManager, v3 pools/router, Permit2, WETH, USDG, and the Robinhood stock tokens
  behave per their published interfaces on chain 4663 (**fork-verified on mainnet**; see `CHAIN_FACTS.md`,
  `test/fork/*`).
- Admin is **honest-but-restricted**: in production, ownership moves to a `TimelockController` (48h) whose
  proposer/executor is a 2-of-3+ multisig (see `GO_LIVE.md`). Admin cannot alter an existing token's
  fee/mode/recipient/balances; the exhaustive privileged-function list is in `RISKS.md`.
- Reference v3 pools have sufficient observation cardinality (bumped pre-launch).
- Launch is **allowlist-gated** today (closed phase); the allowlist is the final gate removed before public
  launch.

## 4. Core invariants (enforced in `test/invariant` + integration)
1. `token.totalSupply() == 1e9·1e18` forever.
2. Curve solvency: `stock.balanceOf(curve) >= vS − vS0` (curve-favouring dust aside).
3. `vS >= vS0` and `vTStop <= vT <= vT0` pre-graduation.
4. Vault buckets (`creatorOwed + buybackOwed + Σ holder + platformOwed`) == vault stock balance (±dust).
5. Fee split: platform = floor(20%), creator-side = remainder, exact per `notify`.
6. Post-graduation: curve trades revert; graduated liquidity is unremovable (no code path).
7. Router holds 0 balance after every call.
8. Admin actions never change an existing token's fee/mode/recipient/balances.
9. HOLDERS: Σ claimable ≤ distributed.

## 5. Where we most want your attention (risk areas)
- **GraduationImpl delegatecall** — storage-layout safety (no mutable storage in impl), the `OnlyDelegatecall`
  guard, and that opening price/LP are driven purely by curve accounting (donation-resistant, L-4).
- **Hook fee delta** — correctness of the fee captured on `beforeSwap`/`afterSwap` deltas and the two-anchor
  TWAP accumulator (it is a deviation *guard*, not a high-fidelity oracle; window ~[300s, 600s]).
- **HOLDERS dividends** — the `beforeBalanceChange`/`_settleToNewBalance` accumulator, eligibility
  exclusions (curve, PM, DEAD, vault, router, 0), and the shared-vault solvency across tokens on the same
  stock. (The one Critical we found, C-1, was a self-transfer double-credit here — fixed + regression-tested;
  please re-derive.)
- **Buyback guard** — min-notional / 2%-cap / 3%-deviation / `minTokensOut`, the zero-reserve case (L-1), and
  the post-graduation TWAP-window gate (L-2).
- **Curve rounding** — every rounding decision must favour the curve; verify no path lets a user extract value
  via dust or round-trips (fuzzed, but please review `CurveMath` by hand).
- **Graduation refund** — a buyback/buy that crosses graduation refunds the unused stock; confirm the refund
  is re-credited to the correct bucket (we rejected a false-positive here, FP-2 — please re-verify).
- **LP NFT → DEAD** — that the full-range position is actually minted to `0xdead` via the real PositionManager
  and is genuinely unrecoverable (fork-tested `ownerOf == DEAD`).

## 6. Automated audit + fuzzing already run (not a substitute for your review)
- **Static:** Slither 0.11.6 — no High/Medium (triage in `AUDIT_SCOPE.md` / `slither-report.txt`).
- **Agentic audit:** 12 specialist agents + adversarial verification → 1 Critical (fixed), 4 Low (all fixed),
  1 Info (fixed), 2 rejected with file:line proof. Full detail in `audit/FINDINGS.md`.
- **Fuzzing (medusa), 0 violations across both:**
  - `CurveMathFuzz` (assertion): 31m, **25.2M calls**, 4/4 properties.
  - `CourFuzz` (stateful curve+vault): 12m, **1.6M calls**, 11/11 properties (supply, solvency, reserve
    ranges, vault buckets, 20/80 split, round-trip, graduation count).
- **Coverage:** src lines ≈ **97.1%** (≥95%). Branch ≈ **65%** (80% target not met — honestly documented in
  `AUDIT_REPORT.md §4`; forge's branch metric is pessimistic, remaining branches are defensive/exotic).

## 7. How to run the tests
```bash
./bootstrap.sh                         # fetch pinned deps (gitignored under lib/)
forge build                            # ~40–90s: via_ir + high optimizer_runs are REQUIRED
forge test                             # full suite (fork tests skip unless RH_RPC_URL is set)
FOUNDRY_PROFILE=ci forge test          # 10k-run fuzz profile
RH_RPC_URL=<mainnet 4663> forge test --match-path 'test/fork/*' -vv   # fork: real PositionManager graduation
forge coverage --ir-minimum --report summary
python -m slither . --filter-paths "lib|test|script" --exclude-dependencies
# Medusa harnesses live under test/fizz/ (see audit/FUZZ.md for the exact commands/config).
```
Regression tests for the findings: `HoldersSelfTransfer.t.sol` (C-1), `BuybackGuards.t.sol` (L-1/L-2),
`PriceReaderTest.t.sol` (L-3), `GraduationDonation.t.sol` (L-4).

## 8. Deployment note
The live mainnet deployment (`deployments/4663.json`) is commit `029b233` and contains **C-1/L-1/I-1 only**.
This audit scope (`audit-freeze-v1`) also contains **L-2/L-3/L-4**. There will be **no redeploy until after
your report**; we then do a single final deploy from the audited commit. The allowlist stays enabled
throughout, so only the deployer can launch in the interim.
