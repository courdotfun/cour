# COUR — Fuzz Campaign (medusa)

> Generated with the pashov `fizz` skill approach; harness `test/fizz/CurveMathFuzz.sol`, config
> `medusa.json`. Fuzzer: **medusa 1.5.1** (Go), compiled via crytic-compile 0.4.2 → Foundry (via_ir,
> optimizer_runs=44444444). Echidna is not available on this Windows host; medusa is the Echidna-compatible
> fuzzer used.

Two campaigns were run (43 min total medusa, **0 violations** across both):

### Campaign A — `CurveMathFuzz` (pure curve math, assertion mode)

| Field | Value |
|---|---|
| Config | `medusa.json` (8 workers, call-seq 100) |
| Duration | **31m00s** (`timeout: 1860s`) |
| Total calls | **25,236,587** (~11k–20k/sec) |
| Sequences | 252,367 |
| **Violations** | **0 / 252,367** |
| Result | **4 / 4 assertion properties PASSED** |

### Campaign B — `CourFuzz` (STATEFUL full curve + fee-vault, property + assertion mode)

| Field | Value |
|---|---|
| Config | `medusa-stateful.json` (8 workers, call-seq 100) |
| Duration | **11m58s** (`timeout: 720s`) |
| Total calls | **1,597,269** |
| Sequences | 15,974 |
| Branches hit | **1,083** (full curve + vault system) |
| **Violations** | **0 / 15,974** |
| Result | **11 / 11 tests PASSED** (7 handlers + 4 property oracles) |

Harness B (`test/fizz/CourFuzz.sol`, from the fizz skill) plays the COURFactory role: it clones the real
`COURCurve`, deploys a real `COURToken`, registers it with the real `COURFeeVault`, and fuzzes
buy/sell/roundTrip/claim while checking `property_{totalSupply, solvency, reserveRanges, vaultBuckets}` and
inline asserts (20/80 split SP-03, round-trip no-profit SP-02, graduation token count SP-04). CREATOR mode
keeps the bucket-conservation exact. (Fixed a lazy-init bug so medusa can initialize the chain — see the
commit; the harness launched in its constructor, whose `registerToken` callback hit the not-yet-deployed
harness address.)

Artifacts: `fizz_data/corpus/` (corpus + coverage html/lcov).

Run: `ETHERSCAN… n/a` — `C:\Users\Lenovo\tools\medusa\medusa.exe fuzz --config medusa.json`
(crytic-compile on PATH via `C:\Users\Lenovo\bin\crytic-compile.bat`).

## Properties fuzzed (all PASSED)

Target: the security-critical bonding-curve math (`src/libraries/CurveMath.sol`) — pure, so it fuzzes
cleanly with no deployment. Each property bounds its inputs to a realistic domain (price $1–$5000,
decimals {6,8,18}, start<grad mcap) and asserts an invariant; medusa flags any failing assert.

| Property | Invariant checked |
|---|---|
| `check_launch_params` | `vS0>0`, `vT0>TOTAL_SUPPLY`, `0<vTStop<vT0`, `k == vS0*vT0`, `sold>0` — p0 never zero across all decimals/prices |
| `check_buy` | `tokensOut == vT0-newVT` (exact reserve delta), `newVT>=vTStop` (never crosses stop), `stockUsed<=netIn` (never over-consumes), graduation caps exactly at `vTStop`, and off-graduation `newVS*newVT>=k` (rounding favours the curve) |
| `check_buy_then_sell_no_profit` | a buy then immediate sell of the received tokens returns `stockOut <= netIn` — **no free money / round-trip profit** |
| `check_sell` | `stockOut == vS-newVS` (exact), `newVT<=vT0`, `newVS*newVT>=k` (rounding favours the curve) |

## Interpretation
Over ~25.2M randomized inputs medusa found **no counterexample** to any invariant: the curve math is
monotone, conserves `k` in the curve's favour, caps graduation exactly at `vT0 - vTStop`, never refunds more
than supplied, and never lets a round-trip profit the trader — consistent with the Foundry unit/fuzz/
invariant suite (`CurveMathTest`, `CurveFuzz`, `GraduationIdentity`, `CurveInvariants`). The audit CRITICAL
(HOLDERS self-transfer) is a VAULT-accounting bug outside this math harness; it is covered by the dedicated
regression `test/integration/HoldersSelfTransfer.t.sol` and the Foundry invariant
`invariant_vault_buckets_match_balance`.

## Notes / limitations
- The harness targets the pure curve math (no v4 pool / hook / Permit2), which is the densest-signal,
  platform-independent target for medusa. Stateful system-level invariants (supply constant, curve
  solvency, vault-bucket solvency incl. the self-transfer fix) are covered by the Foundry invariant suite
  (`test/invariant/`, 256×32 default / 512×64 CI handler calls, 0 unexpected reverts).
- A full-system medusa harness (deploying the v4 PoolManager/PositionManager via cheatcodes) was not used:
  medusa's cheatcode support for `deployCodeTo`-style hook placement is partial on this host, and the pure
  math harness gives higher-signal coverage of the security-critical code.
