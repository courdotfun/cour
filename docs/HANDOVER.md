# HANDOVER — COUR admin ownership → Safe 2-of-3 + 48h Timelock (chain 4663)

> Goal: move `owner()` of **Factory, PriceReader, FeeVault, Router** from the
> deployer EOA to a **48h `TimelockController`** whose proposer/executor is a
> **Safe 2-of-3 multisig**, then prove the deployer has no admin power left.
> `src/` stays frozen (`audit-freeze-v1`); no contract redeploy. Allowlist stays ON.

## Status
- [ ] Safe 2-of-3 created (MULTISIG) — **needs OWNER_1/2/3 from you**
- [ ] `04_HandOver` run (Timelock deployed, ownership transfer initiated)
- [ ] `acceptOwnership` scheduled via Safe (Timelock) for all 4 contracts
- [ ] 48h elapsed → `acceptOwnership` executed via Safe
- [ ] Proven on-chain: `owner()` == Timelock for all 4; deployer powerless
- [ ] `DEPLOYER_PK` removed from `.env`

Safe v1.4.1 canonical contracts are **confirmed live on 4663** (SafeProxyFactory
`0x4e1D…ec67`, SafeL2 singleton `0x29fc…C762`, fallback `0xfd07…Ec99`), so no Safe
contracts need deploying — we only create a proxy (your multisig).

> NOTE: `app.safe.global` (the hosted Safe UI + Transaction Service) does **not**
> list Robinhood Chain 4663, so you cannot use the hosted app directly. Use the
> **Safe Transaction Builder JSON** files this repo generates (import into a Safe
> UI that supports custom networks, or sign via `safe-cli`). The Safe contracts
> themselves are standard and fully functional on 4663.

---

## Step 1 — create the Safe 2-of-3  (needs your input)

Add three distinct signer addresses to `.env`:

```
OWNER_1=0x...   # e.g. your hardware wallet
OWNER_2=0x...
OWNER_3=0x...
```

Then:

```bash
source .env   # or export OWNER_1/2/3, DEPLOYER_PK, RH_RPC_URL
forge script script/07_DeploySafe.s.sol:DeploySafe --rpc-url $RH_RPC_URL --broadcast --slow
# → logs "SAFE (2-of-3) deployed: 0x...."
```

Put the printed address in `.env` as `MULTISIG=0x…`.

## Step 2 — initiate handover to a fresh 48h Timelock

```bash
forge script script/04_HandOver.s.sol:HandOver --rpc-url $RH_RPC_URL --broadcast --slow
# → logs "timelock 0x...."  (proposer/executor = MULTISIG, minDelay = 48h)
```
This calls `transferOwnership(timelock)` on factory/priceReader/feeVault/router
(Ownable2Step → pending owner = timelock). Ownership is NOT final until the timelock
`acceptOwnership()`s each contract (next steps). Put `TIMELOCK=0x…` in `.env`.

## Step 3 — generate the Safe Transaction Builder files

```bash
TIMELOCK=0x... forge script script/08_SafeHandoverTxs.s.sol:SafeHandoverTxs
# → writes deployments/safe-handover-schedule.json and safe-handover-execute.json
```

## Step 4 — schedule (you sign, 2-of-3)

Import **`deployments/safe-handover-schedule.json`** into your Safe UI
(Transaction Builder) and execute it with 2 signatures. This batches four
`timelock.schedule(contract, 0, acceptOwnership(), 0, 0, 48h)` ops — one per
contract. After this, the 48h timer starts.

## Step 5 — execute after 48h (you sign, 2-of-3)

Once ≥48h have passed, import **`deployments/safe-handover-execute.json`** and
execute it (2-of-3). This batches four `timelock.execute(...)` calls, each of which
makes the Timelock call `acceptOwnership()` on a contract → ownership becomes final.

## Step 6 — prove the handover on-chain

```bash
bash script/verify_handover.sh        # checks owner()==TIMELOCK for all 4 + deployer is powerless
```
Expected: `owner()` == `$TIMELOCK` for factory/priceReader/feeVault/router, and an
admin call from the deployer (e.g. `setLaunchesPaused`) **reverts** (OwnableUnauthorized).

## Step 7 — remove the hot key

Once Step 6 passes, **delete `DEPLOYER_PK` from `.env`** (key is already backed up to
a hardware wallet). From here, all admin actions go through the Safe → Timelock (48h).

---

### Why 48h + multisig
Admin powers only affect **future** launches (see `docs/RISKS.md`); they cannot touch
existing tokens, balances, or graduated liquidity. The 48h timelock gives the public
advance notice of any admin change; the 2-of-3 Safe removes single-key risk.
