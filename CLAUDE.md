# Notes for future Claude Code sessions

## Build/test
- `./bootstrap.sh` first (deps are gitignored under `lib/`).
- `forge build`, `forge test`. Compiles are slow (~40–90s): `via_ir=true`, `optimizer_runs=44444444` — required (v4-core Pool.sol Yul stack + curve/hook locals). Don't lower these without re-checking the Pool.sol stack error.
- Fork tests skip unless `RH_RPC_URL` is set. CI profile: `FOUNDRY_PROFILE=ci` (10k fuzz).
- Lints `unsafe-typecast` and `block-timestamp` are intentionally excluded (see foundry.toml / DECISIONS).

## Conventions
- Custom errors only (`libraries/Errors.sol`), events in `libraries/Events.sol`, constants in `libraries/Constants.sol`. NatSpec on externals.
- All token/stock accounting in **raw** units (ERC-8056 aware). Always read `decimals()`.
- Rounding always favours the curve (`CurveMath`). Time logic uses `block.timestamp` only.
- Remappings pin v4-core to v4-periphery's vendored copy; `@openzeppelin/contracts/` is top-level OZ v5.1.0; `solady/`.

## Architecture gotchas
- Deploy order matters: factory address is predicted by nonce so curveImpl + CREATE2-mined hook can reference it (see `script/DeployCore.s.sol`). In tests, the hook is placed via `deployCodeTo` at a flag-valid address.
- Graduation adds full-range liquidity owned by the factory with NO removal path (= burned LP); `positionId` in `Graduated` is 0.
- Vault/router/factory swap the v4 pool via their own `unlock` callback (never the forked Universal Router). `PoolManagerSwapper` is the shared base.
- HOLDERS dividend bookkeeping: the token calls `vault.beforeBalanceChange` and the vault keys by `msg.sender`.

## Where things are
- Full flow proof (no fork): `test/integration/LaunchToGraduation.t.sol`, `Rehearsal.t.sol`.
- Invariants: `test/invariant/`. PriceReader math vs mock v3: `test/unit/PriceReaderTest.t.sol`.
- Out of scope for Phase 1: frontend, indexer, limit orders, mixed fee modes, governance.
