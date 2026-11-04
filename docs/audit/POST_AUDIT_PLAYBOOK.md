# Post-Audit Playbook — from auditor report to public launch

Follow this once the human auditor's report arrives. Goal: fix → re-prove → redeploy (only if needed) →
migrate off-chain → open allowlist. Nothing here opens the allowlist automatically.

## 1. Triage the report
- Log every finding in `docs/audit/FINDINGS.md` (keep the existing format: ID, severity, file:line, fix,
  status, regression test). Mark auditor findings with an `A-` prefix (e.g. `A-1`).
- Severity gate before public: **all Critical/High fixed**, Mediums fixed or formally accepted with rationale,
  Lows fixed or acknowledged. No open Critical/High.

## 2. Fix on a branch (never on the frozen tag)
```bash
git checkout -b audit-fixes
# edit src/… ; add a regression test per finding under test/
forge build && forge test && FOUNDRY_PROFILE=ci forge test
forge coverage --ir-minimum --report summary
# re-run fuzz if curve/vault/hook math changed (see audit/FUZZ.md)
```
- Keep rounding-favours-curve, HOLDERS self-transfer guard, buyback guards, and the LP-NFT→DEAD invariant.
- If a fix changes a public interface, update `deployments/abi/*.json`, the indexer, and the frontend ABIs.

## 3. Re-freeze
```bash
git commit … && git push
git tag -a audit-fix-v1 -m "COUR post-audit fixes"
git push origin audit-fix-v1
```
Update `AUDIT_SCOPE.md` / `AUDITOR_BRIEF.md` to the new tag; ask the auditor to review the diff (fix-review).

## 4. Redeploy (only if contracts changed)
If no contract changed (docs/off-chain only), skip. Otherwise:
```bash
# build from audit-fix-v1 (in-place is fine if `git diff audit-fix-v1 HEAD -- src script foundry.toml` is empty)
forge script script/01_DeployCore.s.sol:DeployCore --rpc-url $RH_RPC_URL --broadcast --slow
forge script script/02_ConfigureStocks.s.sol:ConfigureStocks --rpc-url $RH_RPC_URL --broadcast --slow
forge script script/06_RestoreParams.s.sol:RestoreParams --rpc-url $RH_RPC_URL --broadcast --slow
ETHERSCAN_API_KEY=… bash deployments/verify-4663.sh   # update addresses in the script first
```
- Record new addresses in `deployments/4663.json` (+ tag/commit/compiler). Export ABIs: see the per-contract
  `forge inspect … abi` loop used for `deployments/abi/`.
- **Pause the superseded factory:** `cast send <old factory> 'setLaunchesPaused(bool)' true …` and move its
  record to `deployments/4663-DEPRECATED.json` with the pause tx hash.

## 5. Migrate off-chain to the new addresses
- Indexer: set the new addresses + `startBlock` in `indexer/ponder.config.ts` (or env), re-deploy, re-sync.
- Frontend: it reads `deployments/4663.json` / `deployments/abi/` — rebuild & redeploy (Vercel). Verify no
  stale addresses are hardcoded.
- Monitor: update `monitor` env/config to the new addresses; confirm alerts fire.

## 6. Go-live gates (see GO_LIVE.md — all must be ✅ before opening the allowlist)
1. Auditor report clean (no open Critical/High). 2. Deployer key on a hardware wallet. 3. Safe 2-of-3 created.
4. Ownership handed to the 48h Timelock (`script/04_HandOver.s.sol`) with multisig as proposer/executor.
5. Legal / geo-block reviewed. 6. Indexer + frontend live & monitored. 7. Monitoring + runbook tested.

## 7. Open the allowlist (final, via Timelock/multisig)
```
factory.setLaunchAllowlistEnabled(false)
```
Propose via the multisig → execute after the 48h timelock. Confirm `launchAllowlistEnabled() == false`,
then do a monitored first public launch. Done.
