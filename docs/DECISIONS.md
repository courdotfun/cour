# Decisions (judgment calls)

One line each: decision + reason. Chronological.

- **Dependencies vendored via `bootstrap.sh`, `lib/` gitignored** — forge `--no-git` leaves embedded repos; a bootstrap script is reproducible and keeps the repo clean.
- **Single v4-core source = v4-periphery's pinned submodule (v1.0.2)** — the top-level `forge install Uniswap/v4-core` had empty sub-submodules under `--no-git`; periphery's vendored tree is self-consistent. Removed the broken top-level copy; remappings point everything at periphery's copy for type identity.
- **`via_ir = true`, `optimizer_runs = 44444444`** — the curve/hook locals exceed the stack without IR; the high run count matches v4-core and resolves a Yul stack-too-deep in `Pool.sol`. Trade-off: ~40–90s compiles.
- **Lints `unsafe-typecast` and `block-timestamp` excluded** — the int narrowing is the canonical Uniswap tick/oracle/BalanceDelta pattern (safe); `block.timestamp` is *mandated* by the spec for sub-second blocks.
- **Curve is an EIP-1167 clone; `factory`/`feeVault` are implementation immutables** — identical for all clones (correct and cheap); per-token data is storage set in `initialize`.
- **Deploy cycle (hook↔factory↔curveImpl) broken by predicting the factory's CREATE address via nonce** — curveImpl and the CREATE2-mined hook receive the predicted factory; verified with a `require(address==predicted)`.
- **LP "burned" by adding full-range liquidity directly via `poolManager.modifyLiquidity`, owned by the factory, which has NO removeLiquidity path** — strictly more trustless than minting a PositionManager NFT to dEaD (no NFT that could ever be moved) and avoids Permit2/PositionManager coupling. `Graduated.positionId = 0`. `positionManager` constructor arg retained for future use.
- **Graduation `sqrtPriceX96` uses X128 encoding (`sqrt(amount1·2^128/amount0) << 32`)** — the X192 form overflows uint256 when the raw reserve ratio exceeds 2^64 (low-decimal stock vs 18-decimal token). Found by fuzzing; fixed.
- **Launch-tax exemption on the curve applies ONLY to the atomic `initialBuy` (onlyFactory) and vault buybacks** — no per-address creator exemption on normal buys, so there is nothing to spoof (no `tx.origin`). A buy in the first second pays 99% tax + fee > 100% and reverts cleanly (`ZeroAmount`): you cannot buy in the launch second.
- **Hook applies the same launch tax to all in-window pool buys** (no exemption) — pool trading only exists post-graduation, which is unreachable within 5s, so this is a safety belt that is effectively never hit.
- **Dividend accounting keys by `msg.sender`** in `beforeBalanceChange` — the token reports about itself, so the initial mint is safe without pre-registration and a fake token can only touch its own (fee-less) bucket.
- **HOLDERS fallback when `eligibleSupply == 0`** routes the creator-side fee to `creatorOwed` (claimable by `feeRecipient`) — avoids losing fees before any eligible holder exists.
- **`claim()` (creator) claims `creatorOwed` in any mode** — HOLDERS fallback can accrue there too.
- **Post-graduation buyback 2%-of-reserve cap uses `SqrtPriceMath` full-range reserve math** via the hook; pre-graduation uses the curve's real stock balance. Documented as best-effort in RISKS.
- **PriceReader honours a per-stock configured `RefKind` (USDG or WETH route)** rather than auto-trying both — one reference pool is stored per stock; admin picks the best source. Source order (USDG preferred) is reflected in the returned `source` code.
- **`refLiquidityUsd` is a 2×(quote-token reserve) proxy** for the thin-pool floor — a cheap, adequate gate (the frontend shows the stricter $250k label).
- **Exact-output swaps revert `ExactOutputNotSupported`** (MVP); stretch goal left behind `EXACT_OUTPUT_ENABLED=false`. Not enabled: correct exact-output fee handling was not implemented/tested in Phase 1.
- **Router `quoteBuy/quoteSell` return curve quotes pre-graduation and 0 post-graduation** — the on-chain v4 Quoter is used off-router after graduation.
- **`buyWithETH` assumes a WETH/stock v3 pool at a `DEFAULT_V3_FEE` (3000)** — convenience path only; validated per-stock on fork. Core logic never depends on it or on the Universal Router.
- **Rehearsal demonstrated both locally (always-runnable `Rehearsal.t.sol`, mock-paired) and as a fork script (`03_LaunchRehearsal.s.sol`)** — no RPC was available in the build environment, so the fork script is authored but unrun; the local rehearsal is the runnable proof and generates `REHEARSAL_RESULT.md`.
- **Fork tests skip cleanly when `RH_RPC_URL` is unset** — CI without the secret stays green.
