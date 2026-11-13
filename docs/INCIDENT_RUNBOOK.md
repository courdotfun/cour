# COUR incident runbook

Operational playbook for COUR on Robinhood Chain (chainId **4663**). Pair this
with the `monitor/` service, which raises the alerts referenced below and exposes
`/status` + `/health`.

## Deployment facts (deployments/4663.json)

| Role | Address |
|---|---|
| Factory | `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C` |
| FeeVault | `0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76` |
| PriceReader | `0xF7C914E7B7580a7653DcC3b7574bf041F615e359` |
| Hook | `0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC` |
| Router | `0x835Afd54F9BA20b18b6807B44886123E85A586f9` |
| Deployer / owner (EOA) | `0x1eb25d02fc7C5487D4648a602c355dBC2301030b` |
| NVDA stock | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |

> **Ownership today = the deployer EOA** (`0x1eb2…030b`). A **Safe 2-of-3**
> (`0xDca6d36E44E848a7C4088Fb5d12FfDEd22EA7fA2`, v1.4.1) is deployed but ownership
> has **not** been transferred to it yet — the ownership model is a pending decision
> (see **`HANDOVER.md` → "⚠️ DECISION NEEDED"**). The raw `cast send` forms below
> are the current pre-handover state and for break-glass only.
>
> **⏱️ CRITICAL — response time depends on the ownership model:**
> - **EOA (now)** or **Safe-direct (option a):** emergency `setLaunchesPaused` is
>   **immediate** (one EOA tx, or 2-of-3 Safe signatures).
> - **After 48h Timelock handover (`04_HandOver`):** EVERY owner op — including the
>   `setLaunchesPaused` kill-switch — becomes **schedule → wait 48h → execute**.
>   There is **no separate fast pauser role** (all levers are `onlyOwner`, and
>   `src/` is frozen). Plan incident response around this: do **not** hand over to
>   the 48h Timelock until you accept a 48h pause latency (recommended only for the
>   public phase; keep the Safe as direct, fast owner during the allowlist beta).

### What the admin controls can and cannot do

- `setLaunchesPaused(true)` stops **new** launches only. It does **NOT** pause
  existing tokens, curve trading, graduation, fee accrual, or v4 pool trading.
  There is no global trading kill-switch — this is by design (graduation
  liquidity is burned LP with no removal path).
- `setStock(stock, false, ...)` disallows a stock for **future** launches; it
  does not touch tokens already launched against it.
- Admin cannot move user funds, cannot upgrade contracts (non-upgradeable), and
  cannot remove graduated LP.

### Environment for commands below

```bash
export RPC=https://<robinhood-chain-rpc>      # value of RH_RPC_URL
export FACTORY=0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C
export PRICEREADER=0xF7C914E7B7580a7653DcC3b7574bf041F615e359
export NVDA=0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC
export DEPLOYER=0x1eb25d02fc7C5487D4648a602c355dBC2301030b
# Pre-handover only. Prefer a hardware wallet / keystore over a raw PK.
# export PK=0x...
```

### EMERGENCY: stop new launches

```bash
cast send $FACTORY 'setLaunchesPaused(bool)' true --private-key <...> --rpc-url <...>
```

Concretely:

```bash
cast send $FACTORY 'setLaunchesPaused(bool)' true --private-key $PK --rpc-url $RPC
```

This only stops **NEW** launches — existing tokens and all trading continue.
Post-handover, submit this call through the multisig/timelock instead of a raw
key. Verify:

```bash
cast call $FACTORY 'launchesPaused()(bool)' --rpc-url $RPC   # expect true
```

Un-pause with `... setLaunchesPaused(bool) false ...`.

### EMERGENCY via the Safe (once owner()==Safe) — no Safe UI on 4663

When the Safe (2-of-3, `0xDca6…7fA2`) owns the Factory, the raw-key form above
reverts. Use the cast-based Safe flow (validated on an anvil fork):

```bash
# 1) Build the pause tx + get the hash to sign (true = stop launches; false = resume)
RPC_URL=<your-4663-rpc> bash script/safe/pause.sh true
# 2) TWO owners sign the printed safeTxHash (offline, no RPC):
cast wallet sign --ledger --no-hash <safeTxHash>     # (or --trezor)
# 3) Any one owner executes (auto-sorts signatures):
RPC_URL=<your-4663-rpc> bash script/safe/exec.sh script/safe/out/pause-true.env \
  <ownerAddrA> <sigA> <ownerAddrB> <sigB> --ledger
# 4) Verify:
cast call $FACTORY 'launchesPaused()(bool)' --rpc-url <your-4663-rpc>   # expect true
```

> Needs 2 signers available — keep owner signing devices reachable for incidents.
> `setLaunchesPaused` only stops NEW launches (existing trading is unstoppable by
> design). If/when ownership moves to the 48h Timelock, this same call becomes
> schedule→wait-48h→execute — see `docs/HANDOVER.md`.

---

## Quick triage

1. Check the monitor: `curl -s http://<monitor-host>:8080/status | jq` and
   `curl -s http://<monitor-host>:8080/health`.
2. Confirm severity and which alert fired (Telegram / console).
3. Pick the matching scenario below.
4. Log actions + timestamps in the incident channel. Keep the monitor running.

---

## (a) Contract bug discovered

**Signals:** disclosure (auditor/whitehat/user), anomalous `FeeTaken`/
`BuybackExecuted`, unexpected `Graduated`, funds-at-risk report.

**Who:** protocol lead + on-call engineer. Loop in auditors. Legal/comms if user
funds are affected.

**Steps:**
1. **Assess blast radius.** Which contract, exploitable now, how much is at risk?
   Reproduce against a fork:
   ```bash
   cast call <contract> '<fn sig>' <args> --rpc-url $RPC --block <n>
   RH_RPC_URL=$RPC forge test --match-path test/integration/LaunchToGraduation.t.sol -vvv
   ```
2. **Contain what you can.** Contracts are non-upgradeable and there is no
   trading kill-switch, so containment is limited to:
   - `setLaunchesPaused(true)` — stop new launches (see EMERGENCY above).
   - `setStock(stock, false, refPool, refKind)` — stop new launches for a stock.
   - Front-end/indexer: pull the affected token(s) from the UI / add warnings
     (see scenario (d)) so users stop interacting.
3. **Communicate.** Public advisory telling users to stop trading the affected
   token(s) and, if possible, to sell/exit on the curve or claim fees.
4. **Remediate.** Because there is no proxy, remediation = deploy a fixed
   version and migrate (new factory). Follow `DEPLOY.md`; coordinate a new
   `deployments/<chainId>.json` and re-point the monitor (`DEPLOYMENT_FILE`).
5. **Post-mortem** in `docs/` once resolved.

---

## (b) Stock paused by issuer

**Signals:** monitor alert "Stock issuer appears to have PAUSED the stock token";
`stockPaused: true` on `/status`; or trades/graduations reverting on stock
transfers. If the token does not expose `paused()` the monitor shows
`stockPaused: null` — then this is a **manual check** (issuer status page /
Robinhood announcement / attempt a tiny `cast call` transfer probe).

**Who:** on-call engineer + protocol lead; comms for user messaging.

**Steps:**
1. **Confirm the pause.**
   ```bash
   cast call $NVDA 'paused()(bool)' --rpc-url $RPC            # if supported
   cast call $NVDA 'balanceOf(address)(uint256)' $DEPLOYER --rpc-url $RPC
   ```
   If `paused()` reverts (unsupported), confirm via the issuer's channel and by
   observing that stock `transfer` reverts in failed trade txs.
2. **Understand impact.** While the stock is paused, any flow that moves that
   stock (curve buys/sells, graduation, fee claims in that stock) will revert.
   User principal is not lost — it is stuck until the issuer un-pauses. The COUR
   contracts cannot override an issuer pause.
3. **Contain.** Optionally `setStock(stock, false, ...)` so no new tokens launch
   against the paused stock; add a UI banner on affected tokens (scenario (d)).
4. **Communicate** that activity on `<stock>`-denominated tokens is paused by the
   issuer and will resume when the issuer un-pauses; funds are safe.
5. **Recover.** When the monitor shows `stockPaused: false` again, verify a small
   trade succeeds on a fork, then lift any UI banners / re-allow the stock.

---

## (c) Oracle / TWAP anomaly

**Signals:** monitor alert "PriceReader.stockUsd(NVDA) reverted (TWAP not
ready / oracle anomaly)" (`twapReady: false`), or "Stock price (NVDA) sharp
deviation" (`>= STOCK_DEVIATION_PCT`).

**Who:** on-call engineer + protocol lead.

**Steps:**
1. **Reproduce the read.**
   ```bash
   cast call $PRICEREADER 'stockUsd(address)(uint256,uint8)' $NVDA --rpc-url $RPC
   cast call $PRICEREADER 'twapWindow()(uint32)' --rpc-url $RPC
   cast call $PRICEREADER 'refLiquidityUsd(address)(uint256)' $NVDA --rpc-url $RPC
   ```
   `stockUsd` returns `priceX18` (÷1e18 = USD) and a `source` enum. A revert
   usually means the reference pool TWAP is not ready/stale or ref liquidity
   fell below the configured minimum.
2. **Classify.**
   - **Deviation but valid:** likely a real market move. Compare against an
     external NVDA quote. If genuine, no action beyond noting it.
   - **Revert / stale / thin liquidity:** price-gated actions (launch validation,
     graduation sizing, buybacks that need a TWAP window) will revert. Note:
     post-graduation buyback deliberately requires a full TWAP window (hardening
     L-2), so transient "not ready" around graduation can be expected.
   - **Suspected manipulation of the ref pool:** treat as scenario (a).
3. **Contain** if a bad price could be exploited: `setLaunchesPaused(true)` and,
   if a specific stock's ref pool is compromised, `setStock(stock, false, ...)`.
   If the fix is to re-point the reference pool, that is an admin config change on
   the stock's ref pool via `setStock` (through the multisig post-handover) — and
   will emit `StockSet`, which the monitor flags.
4. **Recover** once `stockUsd` returns a sane value with `twapReady: true` for
   several consecutive health cycles; then un-pause.

---

## (d) Frontend / indexer down

**Signals:** uptime check on the UI/indexer fails; users report stale charts or a
blank app. The chain and contracts are unaffected — this is availability only.

**Who:** frontend/infra on-call.

**Steps:**
1. **Confirm chain is healthy** so you do not chase the wrong layer:
   ```bash
   curl -s http://<monitor-host>:8080/health
   cast block-number --rpc-url $RPC
   ```
   If the monitor is green, the issue is the app/indexer, not COUR.
2. **Frontend:** check host/CDN, build, and its RPC endpoint. Redeploy or roll
   back the last good build.
3. **Indexer:** check the process, its RPC, and its last-processed block vs
   chain head. Restart; if corrupted, re-sync from `startBlock`
   (`106215255`, in `deployments/4663.json`). The `monitor/` service reads the
   chain directly and does **not** depend on the indexer, so `/status` stays a
   source of truth during an indexer outage.
4. **Communicate** a status-page note: "UI/data degraded, funds safe, chain
   unaffected."
5. **Recover** once the indexer has caught up to head and the UI loads.

---

## (e) Key compromise

**Signals:** monitor **critical** alert "OWNERSHIP TRANSFERRED on a core
contract" or "Owner of <x> changed"; unexpected admin events
(`LaunchParamsSet`, `LaunchesPausedSet`, `StockSet`, `TreasurySet`,
`EthInPathSet`); or unexpected outflow from the deployer/treasury.

**Who:** protocol lead + security lead immediately; all-hands.

**Steps:**
1. **Assume the deployer EOA key is compromised** (pre-handover it is the sole
   owner of factory, feeVault, router, priceReader). Treat its signing device as
   hostile.
2. **Check what changed.**
   ```bash
   cast call $FACTORY 'owner()(address)' --rpc-url $RPC
   cast call $FACTORY 'pendingOwner()(address)' --rpc-url $RPC
   cast call 0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76 'owner()(address)' --rpc-url $RPC
   cast call $FACTORY 'launchesPaused()(bool)' --rpc-url $RPC
   ```
   Compare owners against `/status`'s `owners` map and the expected deployer.
3. **If you still control the key and it is merely at risk:** rotate ownership to
   the secure multisig **now** (this is the planned handover, executed early).
   The contracts use Ownable2Step:
   ```bash
   # from the current owner:
   cast send $FACTORY 'transferOwnership(address)' $MULTISIG --private-key <...> --rpc-url $RPC
   # then from the multisig, accept:
   cast send $FACTORY 'acceptOwnership()' --rpc-url $RPC     # via multisig
   ```
   Repeat for feeVault, router, priceReader. Ownable2Step means a transfer is not
   final until the new owner calls `acceptOwnership()` — if an attacker initiated
   a transfer to *their* address but has not been accepted, and you still hold the
   key, call `transferOwnership` again to a safe address to override the pending
   one.
4. **If the attacker already owns the contracts:** you cannot reclaim ownership.
   Limit damage — public warning to stop all interaction, pull tokens from the UI
   (scenario (d)), and begin migration to a freshly deployed system (scenario
   (a)) under new keys. Preserve evidence (tx hashes, blocks).
5. **Treasury:** if `TreasurySet` changed unexpectedly, platform fees are being
   redirected. If you still control ownership, set it back:
   ```bash
   cast send 0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76 'setTreasury(address)' <safe> --private-key <...> --rpc-url $RPC
   ```
6. **Rotate everything** (RPC keys, deploy keys, Telegram bot token) and
   complete the Timelock + multisig handover before resuming normal ops.

---

## Appendix: handy read commands

```bash
# Monitor snapshot / liveness
curl -s http://<monitor-host>:8080/status | jq
curl -s http://<monitor-host>:8080/health

# Protocol state
cast call $FACTORY 'launchesPaused()(bool)' --rpc-url $RPC
cast call $FACTORY 'launchAllowlistEnabled()(bool)' --rpc-url $RPC
cast call $FACTORY 'owner()(address)' --rpc-url $RPC
cast call $PRICEREADER 'stockUsd(address)(uint256,uint8)' $NVDA --rpc-url $RPC
cast balance $DEPLOYER --rpc-url $RPC
```
