# COUR — Phase 1 (contracts)

COUR is a token launchpad on **Robinhood Chain** where every new token is paired with a **Robinhood Stock Token** (NVDA, TSLA, AAPL, SPY, …) instead of ETH. A creator launches a fixed-supply (1,000,000,000 / 18dp) token on a virtual constant-product bonding curve priced in the stock token, from **$4,000 to $60,000** market cap. On sell-out the token **graduates in the same tx** into a Uniswap v4 TOKEN/STOCK pool with the COUR hook; full-range liquidity is minted as a v4 PositionManager NFT **sent to `0x…dEaD`** (the LP is burned — irremovable). A single **creator fee** (1–10%, immutable, taken in the stock) is split 80% creator-side / 20% platform, routed by one of four creator modes. Anti-snipe launch tax decays over the first 5 seconds.

The contracts are **deployed and verified** on Robinhood Chain (chainId 4663) from the frozen audit tag
`audit-freeze-v1`, allowlist-gated (closed beta). This repo is now a monorepo: on-chain contracts (`src/`),
a Ponder **indexer** (`indexer/`), a **frontend** dApp (`frontend/`), and a **monitoring** service (`monitor/`).

## Repo layout
- `src/` — Solidity contracts (frozen at `audit-freeze-v1`; see `docs/AUDIT_SCOPE.md`).
- `indexer/` — Ponder indexer (events → Postgres, GraphQL + REST). See `indexer/README.md`.
- `frontend/` — Vite + viem dApp wired to the live contracts + indexer. See `frontend/README.md`.
- `monitor/` — event/health watcher + alerts. See `monitor/README.md` and `docs/INCIDENT_RUNBOOK.md`.

## Contracts
`COURFactory` (launch + graduate), `COURCurve` (bonding curve clone), `COURToken` (ERC20+Permit), `COURHook` (v4 fee hook + TWAP), `COURFeeVault` (fees/modes/dividends/buyback), `COURPriceReader` (v3 TWAP USD, no third-party oracles), `COURRouter` (unified curve/pool routing), `GraduationImpl` (delegatecalled graduation mechanics).

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
See `docs/DEPLOY.md`. Flow: verify chain (`test/fork/*`) → fork rehearsal (`script/run_fork_rehearsal.sh`)
→ `01_DeployCore` → `02_ConfigureStocks` (test phase) → `run_mainnet_smoke.sh` → `06_RestoreParams` →
verify on robin.etherscan.io → (later) `04_HandOver` to a multisig+Timelock.

### Mainnet (Robinhood Chain, chainId 4663) — FINAL deployment (tag `audit-freeze-v1`)
RPC `https://rpc.mainnet.chain.robinhood.com`. All 7 contracts **verified** on robin.etherscan.io
(see `docs/VERIFICATION.md`). Launch **allowlist is enabled** (closed beta); owner = deployer EOA
(handover to Timelock+multisig pending — `docs/GO_LIVE.md`).

| Contract | Address |
|---|---|
| COURFactory | `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C` |
| COURFeeVault | `0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76` |
| COURHook | `0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC` |
| COURRouter | `0x835Afd54F9BA20b18b6807B44886123E85A586f9` |
| COURPriceReader | `0xF7C914E7B7580a7653DcC3b7574bf041F615e359` |
| COURCurve (impl) | `0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00` |
| GraduationImpl | `0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7` |

Full record (block, compiler, params) in `deployments/4663.json`; ABIs in `deployments/abi/`.

## Docs
`docs/SPEC.md` (source of truth), `ARCHITECTURE.md`, `CHAIN_FACTS.md`, `DECISIONS.md`, `RISKS.md`,
`AUDIT_SCOPE.md`, `AUDITOR_BRIEF.md`, `audit/` (FINDINGS, HUMAN_AUDIT_PACKAGE, POST_AUDIT_PLAYBOOK, OUTREACH_EMAIL),
`DEPLOY.md`, `VERIFICATION.md`, `GO_LIVE.md`, `INCIDENT_RUNBOOK.md`, `FRONTEND_CHANGES.md`,
`REPORT.md` (Bahasa Indonesia), `REHEARSAL_RESULT.md`.

## Principles
No third-party oracles (v3 TWAP only). One fee path. LP burned, not locked. Raw-unit accounting (ERC-8056 aware). Custom errors, NatSpec, transient reentrancy guards. Not for US persons (stock tokens).
