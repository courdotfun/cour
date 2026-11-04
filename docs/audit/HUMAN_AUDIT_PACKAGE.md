# COUR — Human Audit Package (1-page index)

Everything an auditor needs is in this repo. Hand this file to the human who selects/engages the auditor.

## What to send
- **Repo + tag:** `github.com/courdotfun/cour`, tag **`audit-freeze-v1`** (source freeze commit `458c358`).
- **Primary docs:** `AUDITOR_BRIEF.md` (2-page product/architecture/risk), `AUDIT_SCOPE.md` (files + nSLOC +
  live addresses), `audit/FINDINGS.md` (automated findings, all fixed), `audit/FUZZ.md` (medusa results),
  `RISKS.md`, `VERIFICATION.md` (on-chain verification + bytecode proof).
- **Outreach:** `audit/OUTREACH_EMAIL.md` (fill the brackets, send to several firms, compare quotes).

## Scope at a glance
- ~1,846 nSLOC Solidity, 9 contracts + libraries (full table in `AUDIT_SCOPE.md`).
- Solidity 0.8.26, `via_ir=true`, `optimizer_runs=44444444`, `evm_version=cancun`.
- Uniswap **v4 hook** + bonding-curve launchpad; graduation to a v4 pool with the LP NFT burned to DEAD;
  Permit2 / PositionManager / v3-TWAP pricing integrations.

## Live deployment == audited code
The scope is deployed and **verified** on Robinhood Chain (4663), allowlist-gated:
- factory `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C` · feeVault `0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76`
- hook `0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC` · router `0x835Afd54F9BA20b18b6807B44886123E85A586f9`
- priceReader `0xF7C914E7B7580a7653DcC3b7574bf041F615e359` · curveImpl `0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00`
- graduationImpl `0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7`

Bytecode↔source proof: all 7 verified on robin.etherscan.io against the tag source; reproducible
creation-bytecode sha256 per contract in `VERIFICATION.md` (rebuild the tag and compare).

## Requested timeline
- Suggested: **1 engagement, ~1–2 weeks** for ~1.8k nSLOC with a v4-hook specialist. Adjust per auditor.
- We can grant repo access at the tag and do an architecture walkthrough.

## Most want checked (from AUDITOR_BRIEF §5)
GraduationImpl delegatecall & storage safety · hook fee-delta + TWAP guard · HOLDERS dividend accounting &
cross-token vault solvency · buyback guards · curve rounding · graduation refund accounting · LP-NFT→DEAD burn.

## How to run
```bash
./bootstrap.sh && forge build && forge test
FOUNDRY_PROFILE=ci forge test                       # 10k fuzz
RH_RPC_URL=<4663 rpc> forge test --match-path 'test/fork/*' -vv
forge coverage --ir-minimum --report summary
```

## Contact
- [NAME], [ROLE] — [email / Telegram]. (Fill before sending.)
