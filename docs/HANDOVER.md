# HANDOVER — COUR admin ownership → Safe 2-of-3 + 48h Timelock (chain 4663)

> Goal: move `owner()` of **Factory, PriceReader, FeeVault, Router** from the
> deployer EOA to a **48h `TimelockController`** whose proposer/executor is a
> **Safe 2-of-3 multisig**, then prove the deployer has no admin power left.
> `src/` stays frozen (`audit-freeze-v1`); no contract redeploy. Allowlist stays ON.

## Status
- [x] **Safe 2-of-3 created** — `MULTISIG=0xDca6d36E44E848a7C4088Fb5d12FfDEd22EA7fA2`
      (2026-11-13). On-chain verified: `VERSION()=1.4.1`, `getThreshold()=2`,
      `getOwners()` = OWNER_1/2/3. Saved to `.env` + `deployments/4663.json`.
- [ ] **DECISION NEEDED** — ownership model (see "⚠️ DECISION" below) **before** any handover
- [ ] `04_HandOver` run (Timelock deployed, ownership transfer initiated) — **NOT run; awaiting your choice**
- [ ] `acceptOwnership` scheduled via Safe (Timelock) for all 4 contracts
- [ ] 48h elapsed → `acceptOwnership` executed via Safe
- [ ] Proven on-chain: `owner()` == Timelock for all 4; deployer powerless
- [ ] `DEPLOYER_PK` removed from `.env`

> Current `owner()` of factory/priceReader/feeVault/router is STILL the deployer
> EOA (`0x1eb2…030b`). Nothing has been handed over yet — only the Safe exists.

Safe v1.4.1 canonical contracts are **confirmed live on 4663** (SafeProxyFactory
`0x4e1D…ec67`, SafeL2 singleton `0x29fc…C762`, fallback `0xfd07…Ec99`), so no Safe
contracts need deploying — we only create a proxy (your multisig).

> NOTE: `app.safe.global` (the hosted Safe UI + Transaction Service) does **not**
> list Robinhood Chain 4663, so you cannot use the hosted app directly. Use the
> **Safe Transaction Builder JSON** files this repo generates (import into a Safe
> UI that supports custom networks, or sign via `safe-cli`). The Safe contracts
> themselves are standard and fully functional on 4663.

---

## ⚠️ DECISION NEEDED — emergency pause vs 48h Timelock

**The problem.** Every admin lever on the frozen contracts is `onlyOwner`
(`Ownable2Step`) — there is **no separate pauser/guardian role**:

| Function | Contract | Access | Effect |
|---|---|---|---|
| `setLaunchesPaused(bool)` | COURFactory | `onlyOwner` | halts **new** token launches (kill-switch) |
| `setLaunchAllowlistEnabled(bool)` | COURFactory | `onlyOwner` | turns the allowlist on/off |
| `setLaunchAllowlist(addr,bool)` | COURFactory | `onlyOwner` | add/remove an allowlisted launcher |
| `setLaunchParams(...)` | COURFactory | `onlyOwner` | economic params for future launches |
| `setTreasury` / fee admin | COURFeeVault | `onlyOwner` | fee routing |

`04_HandOver.s.sol` moves `owner()` to a **`TimelockController(48h)`** (proposer/
executor = the Safe). **Consequence:** once handed over, *even the emergency
kill-switch* (`setLaunchesPaused`) takes **schedule → wait 48h → execute**. That is
far too slow for incident response.

**Bounding the risk (important).** `setLaunchesPaused` only blocks **new launches**.
Trading on already-launched curves/tokens and graduated Uniswap liquidity is
**permissionless and cannot be paused by any role — by design** (no owner power
reaches existing tokens, balances, or LP). So the owner's "emergency" surface is
limited to: pause new launches, and manage the allowlist. During the **closed
allowlist beta**, only allowlisted addresses can launch at all, so the blast radius
is already small. The window that actually matters for a 48h public guarantee is
**after** `setLaunchAllowlistEnabled(false)` (public launches).

> A clean "guardian can pause instantly, Timelock governs everything else" pattern
> would need a separate role in the contract — **not possible without changing
> `src/`** (frozen). So the realistic options are about *when* to install the
> Timelock, not about adding a role.

### Options (no `src/` change)

**(a) Safe owns directly during beta → 48h Timelock before going public.** *(recommended)*
Transfer `owner()` to the **Safe 2-of-3** now (not the Timelock). During the
allowlist beta the Safe can pause/fix **immediately** (2 signatures, no delay). As
the *final* step before `setLaunchAllowlistEnabled(false)`, run the Timelock
handover so the public phase has the 48h guarantee.
- Security: strong (no single key); no delay means 2 colluding/compromised signers
  could act instantly — acceptable while blast radius is small (beta).
- Incident speed: **fastest** (immediate 2-of-3). Best fit for beta.
- Public trust: 48h delay is installed exactly when the public is exposed.
- Requires a small extra step: a one-off "transfer ownership to Safe" now, then the
  normal `04_HandOver` (Safe→Timelock) later. (Script note below.)

**(b) Timelock now with a short `minDelay`, raise to 48h before public.**
Hand over to a Timelock immediately but with e.g. `minDelay = 1–6h`; raise it to
48h via `updateDelay` before public.
- `updateDelay` on OZ `TimelockController` can **only** be called by the Timelock
  itself, i.e. it must be *scheduled with the current (short) delay and executed* —
  this is safe and standard (no admin backdoor; `admin = address(0)`).
- Security: delay-based safety net + full on-chain transparency from day one.
- Incident speed: emergency pause still waits the short delay (e.g. 1h) — slower
  than (a), much faster than 48h.
- Public trust: consistent "timelock-governed from launch" story; the raise to 48h
  is a clean, auditable op. Caveat: a short delay during beta is weak in practice
  (a malicious scheduled op could slip by unnoticed in 1h).
- Requires editing `04_HandOver.s.sol` to parameterize `minDelay` (script change —
  allowed; `src/` untouched).

**(c) Other paths considered.**
- **(c1)** Keep the deployer EOA as owner through beta, hand to the 48h Timelock
  only at go-public. Fast, but single-key risk during beta → worse than (a).
- **(c2)** Transfer to the Safe **permanently**, no Timelock ever. Simplest, instant
  response forever, but no enforced user-notice delay in the public phase → weaker
  public-trust story. Reasonable only if you accept "multisig = governance".
- **(c3)** Guardian/pause-role split — **off the table** (needs a `src/` change).

### Recommendation → **(a)**
During the closed beta the priority is *agility with contained risk*: the Safe
2-of-3 gives fast incident response and removes single-key risk, while the allowlist
+ unstoppable-existing-trading design keeps the blast radius small. Install the 48h
Timelock as the last action before opening public launches, so users get the
advance-notice guarantee precisely when it matters. If you prefer a single
irreversible handover now, pick (b) with `minDelay = 24h` as a middle ground.

**Tell me (a), (b), or (c#)** and I will run the handover accordingly. Until then,
`owner()` remains the deployer EOA and nothing is transferred.

> Script note: `04_HandOver.s.sol` currently hardcodes Safe→**Timelock(48h)**. For
> (a) I'll add a one-line "transfer ownership to the Safe" op now and defer
> `04_HandOver` to go-public; for (b) I'll parameterize `minDelay`. Both are
> script-only changes; `src/` stays frozen.

---

## Step 1 — create the Safe 2-of-3  ✅ DONE (2026-11-13)

`MULTISIG=0xDca6d36E44E848a7C4088Fb5d12FfDEd22EA7fA2` — verified 2-of-3, v1.4.1.
(Original instructions kept below for reference.)

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
