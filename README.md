# COUR — Phase 1 (contracts)

COUR is a token launchpad on **Robinhood Chain** where every new token is paired with a **Robinhood Stock Token** (NVDA, TSLA, AAPL, SPY, …) instead of ETH. A creator launches a fixed-supply (1,000,000,000 / 18dp) token on a virtual constant-product bonding curve priced in the stock token, from **$4,000 to $60,000** market cap. On sell-out the token **graduates in the same tx** into a Uniswap v4 TOKEN/STOCK pool with the COUR hook, full-range liquidity is added, and the LP is **burned** (irremovable). A single **creator fee** (1–10%, immutable, taken in the stock) is split 80% creator-side / 20% platform, routed by one of four creator modes. Anti-snipe launch tax decays over the first 5 seconds.

Phase 1 is **contracts only** — no frontend, indexer, or backend.

## Contracts
`COURFactory` (launch + graduate), `COURCurve` (bonding curve clone), `COURToken` (ERC20+Permit), `COURHook` (v4 fee hook + TWAP), `COURFeeVault` (fees/modes/dividends/buyback), `COURPriceReader` (v3 TWAP USD, no third-party oracles), `COURRouter` (unified curve/pool routing).

## Build & test
```
./bootstrap.sh          # fetch pinned deps (lib/ is gitignored)
forge build
forge test              # unit + fuzz + invariant + integration (fork tests skip without RH_RPC_URL)
forge test --match-test test_rehearsal   # writes docs/REHEARSAL_RESULT.md
FOUNDRY_PROFILE=ci forge test            # 10k fuzz runs
```
Toolchain: Foundry, Solidity 0.8.26, `evm_version = cancun`, `via_ir = true`, `optimizer_runs = 44444444` (matches v4-core; see docs/DECISIONS.md).

## Deploy
See `docs/DEPLOY.md` (00_VerifyChain → 01_DeployCore → 02_ConfigureStocks → 03_LaunchRehearsal → 04_HandOver).

## Docs
`docs/SPEC.md` (source of truth), `ARCHITECTURE.md`, `CHAIN_FACTS.md`, `DECISIONS.md`, `RISKS.md`, `AUDIT_SCOPE.md`, `DEPLOY.md`, `REPORT.md` (Bahasa Indonesia), `REHEARSAL_RESULT.md`.

## Principles
No third-party oracles (v3 TWAP only). One fee path. LP burned, not locked. Raw-unit accounting (ERC-8056 aware). Custom errors, NatSpec, transient reentrancy guards. Not for US persons (stock tokens).
