# COUR — Fuzz Properties

Stateful fuzz invariants for the COUR bonding-curve launchpad, exercised by the Medusa harness
`test/fizz/CourFuzz.sol`. These encode the known protocol invariants from `docs/AUDIT_SCOPE.md §Invariants`.

Harness topology: **focused / fallback** (no Uniswap v4 pool). The harness itself plays the COURFactory
role — it clones the real `COURCurve`, deploys a real `COURToken`, registers it with the real
`COURFeeVault`, and implements `curveOf` / `graduate`. A fresh `MockStock` is used per launch so each
(token, stock) pair's vault accounting is isolated; the token is in `CREATOR` mode so the bucket sum is
exact. On graduation the harness relaunches so live-curve paths keep getting fuzzed.

- `property_*` = global oracle, evaluated by Medusa after every call sequence.
- `assert` (inline) = per-action invariant checked inside the handler that performs the action.
- Guarantee tag: **SHOULD-HOLD** = documented/mathematical guarantee; a violation is a confirmed bug.

| ID | Guarantee | Kind | Where | Plain English |
|----|-----------|------|-------|---------------|
| GL-01 | SHOULD-HOLD | `property_` | `property_totalSupply` | The token's `totalSupply()` is always exactly 1e9 · 1e18 (1,000,000,000 tokens). Supply is minted once to the curve; there is no mint or burn path. |
| GL-02 | SHOULD-HOLD | `property_` | `property_vaultBuckets` | Vault bucket conservation: `creatorOwed(token) + buybackOwed(token) + platformOwed(stock)` equals the vault's stock balance (±1 wei dust). No fee stock is ever unaccounted or double-counted. |
| SP-01 | SHOULD-HOLD | `property_` | `property_solvency` | Curve solvency (pre-graduation): the real stock held by the curve is `>=` the net stock raised, `vS - vS0`. The curve can always honor sells. |
| SP-02 | SHOULD-HOLD | `assert` | `handler_roundTrip` | Buy→sell round-trip never profits the trader: buying with `X` stock and immediately selling back exactly the tokens received returns `<= X` stock. Rounding and fees always favor the curve. |
| SP-03 | SHOULD-HOLD | `assert` | `handler_buy` | 20/80 fee split (per `notify`, non-graduating buy): platform receives `floor(20% · fee)` and the creator side receives the exact remainder. |
| SP-04 | SHOULD-HOLD | `assert` | `graduate` | Tokens sold at graduation equal `vT0 - vTStop` exactly: cumulative tokens delivered to buyers over the curve's life telescopes to the virtual-reserve delta. |
| SP-05 | SHOULD-HOLD | `property_` | `property_reserveRanges` | Reserve ranges (pre-graduation): `vS >= vS0` and `vTStop <= vT <= vT0`. The curve never runs the reserves outside their launch bounds before graduating. |

## Mapping to AUDIT_SCOPE invariants

| AUDIT_SCOPE | Property |
|---|---|
| (1) totalSupply constant | GL-01 |
| (2) curve solvency `stock.balanceOf(curve) >= vS - vS0` | SP-01 |
| (3) `vS >= vS0`, `vTStop <= vT <= vT0` | SP-05 |
| (4) buy→sell round-trip never profits | SP-02 |
| (5) vault buckets sum == vault stock balance | GL-02 |
| (6) 20/80 fee split | SP-03 |
| (7) tokens sold at graduation == `vT0 - vTStop` | SP-04 |

## Out of scope for this harness

Invariants that require the live Uniswap v4 pool are not covered by the focused harness and are left to the
Foundry integration/invariant suites: post-graduation pool trades reverting on the curve (covered by SP's
graduation relaunch only indirectly), router zero-balance, v4-pool-side buyback (`BUYBACK`/`BUYBACK_BURN`
deviation guards), HOLDERS-mode pro-rata dividends, and admin-isolation checks.
