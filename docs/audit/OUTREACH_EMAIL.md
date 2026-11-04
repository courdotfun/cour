# Auditor Outreach — Draft (EN)

> Fill the **[bracketed]** fields before sending. Do not name a specific firm here — the human picks the
> auditor. Send to several and compare quotes. Attach / link `AUDIT_SCOPE.md`, `AUDITOR_BRIEF.md`,
> `HUMAN_AUDIT_PACKAGE.md`.

---

**Subject:** Security audit request — COUR (Solidity, ~1.8k nSLOC, Uniswap v4 hook + bonding-curve launchpad)

Hi [Auditor / team],

We'd like a quote and availability for a security audit of **COUR**, a bonding-curve token launchpad that
graduates to a Uniswap **v4** pool, deployed on **Robinhood Chain (chainId 4663)**.

- **Scope:** ~1,846 nSLOC of Solidity across `src/` (9 contracts + libraries). Full file list and per-file
  nSLOC in `AUDIT_SCOPE.md`.
- **Code (frozen):** git tag `audit-freeze-v1`, repo `github.com/courdotfun/cour`. Source freeze commit
  `458c358`. Solidity 0.8.26, `via_ir=true`, `optimizer_runs=44444444`, `evm_version=cancun`.
- **What it does / architecture / trust model / invariants / risk areas:** `AUDITOR_BRIEF.md` (2 pages).
- **Deployed (allowlist-gated, closed beta):** final contracts at [FINAL_ADDRESSES — see deployments/4663.json];
  we can point you at the live instance on chain 4663.
- **Pre-work done (not a substitute for your review):** Slither (no High/Medium), an agentic audit pass
  (1 Critical + 4 Low + 1 Info, all fixed with regression tests; 2 rejected), and medusa fuzzing
  (~27M calls, 0 violations). Details in `audit/FINDINGS.md`, `audit/FUZZ.md`.
- **Areas we most want eyes on:** `GraduationImpl` delegatecall & storage safety, the v4 hook fee-delta and
  TWAP guard, HOLDERS dividend accounting / cross-token vault solvency, buyback guards, curve rounding,
  graduation refund accounting, and the LP-NFT→DEAD burn.

Could you share:
1. Availability / earliest start date and estimated duration.
2. A fixed quote (or day rate + estimated days).
3. Your process (manual review + tooling, number of auditors, interim findings cadence).
4. Whether you can review a Uniswap **v4 hook** + Permit2 / PositionManager integration specifically.

Happy to grant repo access at the tag and walk through the architecture. Timeline target: [TARGET_WINDOW].

Thanks,
[NAME] — [ROLE], COUR
[CONTACT: email / Telegram / TG handle]
