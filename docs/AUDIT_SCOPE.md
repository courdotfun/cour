# Audit Scope

**Freeze tag:** `audit-freeze-v1`. **Source freeze commit:** `458c358` (last code change; all commits after it
are documentation only — resolve the tag with `git rev-parse audit-freeze-v1`). Solidity 0.8.26,
`evm_version = cancun`, `via_ir = true`, `optimizer_runs = 44444444`.
Dependencies (pinned via `bootstrap.sh`): Uniswap v4-core & v4-periphery (v1.0.2 tree), OpenZeppelin v5.1.0, Solady, forge-std.

## Files in scope (nSLOC — non-blank, non-comment, approx)

| File | nSLOC | Purpose |
|---|---|---|
| src/COURHook.sol | 296 | v4 hook: fee capture on pool swaps, tick-accumulator TWAP (+ `twapWindowFull`, L-2), pool gating |
| src/COURFeeVault.sol | 257 | fee custody/routing, 4 modes, dividends, buyback (TWAP + 2%-cap guards), claims |
| src/COURFactory.sol | 210 | launch + graduation orchestration (delegatecalls `GraduationImpl`), launch allowlist, admin |
| src/COURCurve.sol | 192 | bonding curve buy/sell, fee+tax, refund+graduate |
| src/COURRouter.sol | 143 | unified curve/pool routing, ETH path, holds no funds |
| src/GraduationImpl.sol | 84 | graduation mechanics via **delegatecall**: pool init + full-range LP NFT→DEAD (Permit2), donation sweep, `OnlyDelegatecall` guard |
| src/COURPriceReader.sol | 117 | v3 TWAP USD pricing (USDG / WETH routes) + donation-proof in-range liquidity floor (L-3) |
| src/COURToken.sol | 41 | fixed-supply ERC20+Permit, HOLDERS hook |
| src/libraries/CurveMath.sol | 72 | x·y=k math, launch params, curve-favouring rounding |
| src/libraries/PoolManagerSwapper.sol | 59 | exact-input swaps via PoolManager `unlock` |
| src/libraries/V3Oracle.sol | 34 | OracleLibrary port (consult, getQuoteAtTick) |
| src/libraries/{Constants,Errors,Events,LaunchTax,PoolKeyLib} | 152 | shared defs + tax + pool key |
| src/types/{CreatorMode,TokenConfig} | 23 | enums/structs |
| src/interfaces/* | 166 | interfaces (incl. minimal external) |
| **Total src** | **~1846** | |

## Scope == live deployment (final deploy done 2026-11-05)
The **live mainnet deployment** (`deployments/4663.json`, chain 4663) IS the audit scope: it was deployed from
tag **`audit-freeze-v1`** (source freeze `458c358`) and contains **C-1, L-1, I-1 + L-2, L-3, L-4**. All 7
contracts are **verified on robin.etherscan.io** against this exact source (see `docs/VERIFICATION.md`), which
is the authoritative bytecode↔source proof. Reproducible creation-bytecode sha256 per contract are listed in
`VERIFICATION.md`.

| Contract | Address |
|---|---|
| COURFactory | `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C` |
| COURFeeVault | `0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76` |
| COURHook | `0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC` |
| COURRouter | `0x835Afd54F9BA20b18b6807B44886123E85A586f9` |
| COURPriceReader | `0xF7C914E7B7580a7653DcC3b7574bf041F615e359` |
| COURCurve (impl) | `0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00` |
| GraduationImpl | `0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7` |

The deployment is **allowlist-gated** (only the deployer can launch) and owner = deployer EOA (handover to
Timelock+multisig pending). The two prior deployments (029b233 and the older one) are **paused and deprecated**
(`deployments/4663-DEPRECATED.json`). If the human audit requires code changes, redeploy as `audit-fix-v1`
(see `docs/audit/POST_AUDIT_PLAYBOOK.md`).

## Trust assumptions
- Uniswap v4 PoolManager/PositionManager, v3 pools/router, Permit2, WETH, USDG, and the Robinhood stock tokens behave per their published interfaces on Robinhood Chain. **Fork-verified on mainnet 2026-10-29** (code present, ABIs match, Cancun/TSTORE confirmed, graduation mints the LP NFT to DEAD against the real PositionManager; see CHAIN_FACTS + `test/fork/*`).
- Admin (Timelock+multisig) is honest-but-restricted; see RISKS for the exhaustive privileged-function list.
- Reference v3 pools have sufficient observation cardinality (bumped pre-launch).

## Invariants (enforced in test/invariant + integration)
1. `token.totalSupply() == 1e9·1e18` forever.
2. Curve solvency: `stock.balanceOf(curve) >= vS - vS0` (curve-favouring dust aside).
3. `vS >= vS0` and `vTStop <= vT <= vT0` pre-graduation.
4. Vault buckets (`creatorOwed + buybackOwed + Σholder + platformOwed`) == vault stock balance (±dust). (CREATOR-mode exact form tested.)
5. 20/80 split: platform = floor(20%), creator side = remainder (exact per `notify`).
6. Post-graduation: curve trades revert; graduated liquidity is unremovable (no code path).
7. Router holds 0 balance after every call.
8. Admin actions never change an existing token's fee/mode/recipient/balances.
9. HOLDERS: Σ claimable ≤ distributed.

## Security checklist (spec §12)
- **Reentrancy**: transient guard (`ReentrancyGuardTransient`) on curve, vault, router, factory; hook/callback entrypoints restricted to PoolManager; vault `notify` restricted to hook/curve.
- **Hook integrity**: pools with the COUR hook can be initialized only by the factory (`beforeInitialize` checks `sender==factory`, `fee==0`, `tickSpacing==60`, one currency is a COUR token whose stock is the other). Fee ≤ 10% (enforced at launch). Hook address bits validated in its constructor and via HookMiner at deploy.
- **Rounding**: always against the user / toward the curve (`CurveMath`); curve uses internal accounting (not `balanceOf`) → immune to donation/inflation.
- **Weird stock**: decimals 6/8/18, pause, multiplier changes all handled (raw accounting).
- **Sandwich**: atomic graduation; buyback TWAP-deviation + 2%-cap + `minTokensOut`.
- **Launch-tax bypass**: no `tx.origin`; exemption only for the atomic `initialBuy` and vault buybacks — nothing spoofable.
- **Holder gaming**: debt settled on every transfer (`beforeBalanceChange`); excluded addresses (curve, PM, DEAD, vault, router, 0) correct.
- **Admin can't rug**: see RISKS; proven by tests.
- **DoS**: no unbounded loops in `src/`.

## Static analysis (Slither)
See `## Slither triage` below. If Slither could not be installed/run in the build environment, that is noted in REPORT §7 and must be run by the human before audit.

## Slither triage
Run: `python -m slither . --filter-paths "lib|test|script" --exclude-dependencies` (slither 0.11.6). Raw
output: `docs/slither-raw.txt`; full triage: `docs/slither-report.txt`. 99 contracts, 103 results —
**no High/Medium**. Root cause for the dead-code/constable/immutable/uninitialized-state cluster: slither's
state-write dataflow is incomplete under `via_ir` (it even reports the constructor-set immutable
`poolManagerC` as "uninitialized"). Each is refuted by a write/call site in `slither-report.txt`. Summary:

| Detector | Verdict | Notes |
|---|---|---|
| `timestamp` (comparisons) | Acknowledged / by design | `block.timestamp` is mandated by the spec (sub-second blocks). Deadlines, tax window, and TWAP all use it. No block numbers anywhere. |
| `reentrancy-events` | False positive | Only events emitted after an external call (e.g. `StockSet` after `setRefPool`). State-changing paths carry `nonReentrant` transient guards; event ordering is cosmetic. |
| `cyclomatic-complexity` | Acknowledged | `COURCurve._buy` (13), `COURFactory.createToken` (12) — inherent to the fee/tax/refund/graduation and launch flows; heavily tested. |
| `dead-code` | False positive | Flagged `_sweep`/`_accrue`/`_checkDeviation`/`_poolStockReserve`/`_permit2Approve`/`_graduate`/router `_buy`/`_sell` are all called (verified per file:line in slither-report.txt; slither mis-traces internal fns under via-IR). The one genuinely dead fn, `_pay`, was REMOVED in the §2.3 graduation rewrite. |
| `constable-states` (`COURFeeVault.factory/hook/router/treasury/priceReader/_wired`) | False positive | Written in `wire()`/`setTreasury`; cannot be `constant`. (Set-once post-deploy for ordering reasons; not constructor-settable → not `immutable`.) |
| `immutable-states` (`COURFactory.startMcUsd/gradMcUsd/minRefLiqUsd/launchFee`) | False positive | Mutated by admin `setLaunchParams`; intentionally mutable for future launches. |

No finding required a code change. (The graduation `sqrtPrice` overflow was found earlier by fuzzing, not Slither, and is fixed.)
