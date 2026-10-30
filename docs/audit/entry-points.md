# Entry Point Map

> COUR Phase 1 | 39 entry points | 11 permissionless | 13 role-gated | 15 admin-only

Scan source: `entry_points.py` (39 across 8 of 18 scanned files). `COURCurve` is an EIP-1167 clone deployed per token; its entry points exist once per launched token.

---

## Protocol Flow Paths

### Deployment & Wiring (Admin, one-time)

`COURFeeVault.wire()` → `COURPriceReader.setAuthorizedSetter(factory)` → `COURPriceReader.setWethUsdgPool()` → `COURFactory.setStock(stock, true, refPool, kind)` → `COURRouter.setEthInPath(stock, path)`  ◄── vault/reader deploy before factory (addresses predicted by nonce)

### Launch (Creator)

`[admin wiring above]` → `COURFactory.createToken()`  ◄── allowlisted, stockAllowed, refLiq ≥ floor
                               ├─→ clones `COURCurve`, CREATE2 `COURToken` (mints supply to curve)
                               ├─→ `COURFeeVault.registerToken()`
                               └─→ optional `COURCurve.initialBuy()` (fee, no tax, cannot graduate)

### Trade (Trader)

`[createToken above]` → `COURRouter.buy()/sell()` or direct `COURCurve.buy()/sell()`
                               └─→ on sell-out: `COURCurve._graduate()` → `COURFactory.graduate()` → `GraduationImpl.graduate()` (delegatecall) → `v4 PoolManager.initialize` + LP NFT → DEAD
`[graduated]` → `COURRouter.buy()/sell()` routes to the v4 pool  ◄── curve.graduated() == true

### Fees & Rewards

`[trades accrue fees]` → `COURFeeVault.notify()` (by curve pre-grad / hook post-grad)
   ├─ CREATOR → `claim()`  ◄── msg.sender == feeRecipient
   ├─ HOLDERS → `COURToken.transfer` fires `beforeBalanceChange()` → holder `claimHolder()`
   ├─ BUYBACK(_BURN) → `executeBuyback()`  ◄── feeRecipient, min-USD + 2%-reserve + 3%-deviation
   └─ platform → `claimPlatform(stock)` (any caller → treasury)

---

## Permissionless

### `COURCurve.buy()`

| Aspect | Detail |
|--------|--------|
| Visibility | external, nonReentrant |
| Caller | Trader (or router) |
| Parameters | stockIn (user-controlled), minTokensOut (user-controlled), to (user-controlled), deadline (user-controlled) |
| Call chain | `→ CurveMath.buy() → stock.transferFrom → token.transfer → FeeVault.notify() → [_graduate → Factory.graduate]` |
| State modified | `_vS`, `_vT`, `graduated` |
| Value flow | stock: payer → curve/vault; token: curve → `to` |
| Reentrancy guard | yes |

### `COURCurve.sell()`

| Aspect | Detail |
|--------|--------|
| Visibility | external, nonReentrant |
| Caller | Trader (or router) |
| Parameters | tokensIn, minStockOut, to, deadline (all user-controlled) |
| Call chain | `→ CurveMath.sell() → token.transferFrom → FeeVault.notify() → stock.transfer` |
| State modified | `_vS`, `_vT` |
| Value flow | token: payer → curve; stock: curve → `to` (+ fee → vault) |
| Reentrancy guard | yes |

### `COURRouter.buy()`

| Aspect | Detail |
|--------|--------|
| Visibility | external, nonReentrant |
| Caller | Trader |
| Parameters | token, stockIn, minOut, deadline (all user-controlled) |
| Call chain | `→ stock.transferFrom → [curve.buy() \| PoolManagerSwapper._swapExactInput → PoolManager.unlock] → _sweep` |
| State modified | none in router (custodies nothing); curve or pool state |
| Value flow | stock: payer → curve/pool; token → payer; residuals swept back |
| Reentrancy guard | yes |

### `COURRouter.sell()`

| Aspect | Detail |
|--------|--------|
| Visibility | external, nonReentrant |
| Caller | Trader |
| Parameters | token, tokensIn, minOut, deadline (all user-controlled) |
| Call chain | `→ token.transferFrom → [curve.sell() \| _swapExactInput] → _sweep` |
| State modified | curve or pool state |
| Value flow | token → curve/pool; stock → payer |
| Reentrancy guard | yes |

### `COURRouter.buyWithETH()`

| Aspect | Detail |
|--------|--------|
| Visibility | external payable, nonReentrant |
| Caller | Trader |
| Parameters | token, minOut, deadline (user-controlled); msg.value (user-controlled); path (protocol-derived, admin-set per stock) |
| Call chain | `→ WETH.deposit → v3Router.exactInput (WETH→…→stock) → _buy → _sweep(stock/token/weth) → refund ETH` |
| State modified | none persisted (router holds nothing) |
| Value flow | ETH → WETH → stock → curve/pool; token → payer; all residuals refunded |
| Reentrancy guard | yes |

### `COURRouter.receive()`

| Aspect | Detail |
|--------|--------|
| Visibility | external payable |
| Caller | WETH / anyone |
| Parameters | — |
| Call chain | none (empty body) |
| State modified | contract ETH balance (transient; swept in buyWithETH) |
| Value flow | ETH in |
| Reentrancy guard | no |

### `COURFeeVault.claimHolder()`

| Aspect | Detail |
|--------|--------|
| Visibility | external, nonReentrant |
| Caller | Any token holder (HOLDERS mode) |
| Parameters | token (user-controlled) |
| Call chain | `→ _accrue() → stock.transfer(msg.sender)` |
| State modified | `_pending[token][msg.sender]`, `_debt[token][msg.sender]` |
| Value flow | stock: vault → caller |
| Reentrancy guard | yes |

### `COURFeeVault.claimPlatform()`

| Aspect | Detail |
|--------|--------|
| Visibility | external, nonReentrant |
| Caller | Anyone (funds always go to treasury) |
| Parameters | stock (user-controlled) |
| Call chain | `→ stock.transfer(treasury)` |
| State modified | `platformOwed[stock]` |
| Value flow | stock: vault → treasury |
| Reentrancy guard | yes |

### `COURPriceReader.bumpCardinality()`

| Aspect | Detail |
|--------|--------|
| Visibility | external |
| Caller | Anyone (operational helper) |
| Parameters | pool (user-controlled), n (user-controlled) |
| Call chain | `→ IUniswapV3PoolMinimal.increaseObservationCardinalityNext(n)` |
| State modified | none in reader (mutates the external v3 pool) |
| Value flow | none |
| Reentrancy guard | no |

### `GraduationImpl.graduate()` (standalone-callable)

| Aspect | Detail |
|--------|--------|
| Visibility | external (intended only as a delegatecall target) |
| Caller | Anyone, directly on the deployed impl |
| Parameters | Params p (all user-controlled when called directly) |
| Call chain | `→ PoolManager.initialize → PositionManager.modifyLiquidities → Permit2.approve` |
| State modified | none (impl holds no storage, no funds, no approvals) |
| Value flow | none when called directly (operates on the impl's own empty balances; COUR-hook pool init reverts since sender ≠ factory) |
| Reentrancy guard | no |

### `COURFactory.createToken()` *(permissionless by design; currently allowlist-gated)*

| Aspect | Detail |
|--------|--------|
| Visibility | external payable, nonReentrant |
| Caller | Creator (allowlisted in the closed test phase) |
| Parameters | CreateParams p (user-controlled): name/symbol/metadataURI/stock/creatorFeeBps/creatorMode/salt/feeRecipient/initialBuyStock/minInitialTokens; msg.value must == launchFee |
| Call chain | `→ priceReader.refLiquidityUsd/stockUsd → LibClone.clone(curveImpl) → new COURToken{salt} → CurveMath.computeLaunchParams → curve.initialize → feeVault.registerToken → [curve.initialBuy]` |
| State modified | `isCOURToken`, `curveOf`, `_config`, `_poolId` |
| Value flow | optional initialBuyStock: creator → curve; launchFee ETH → factory |
| Reentrancy guard | yes |

---

## Role-Gated

### Factory / Curve lifecycle

#### `COURCurve.initialize()` — `OnlyFactory`
Sets per-clone config once. Call chain: ← `COURFactory.createToken`. State: all curve storage. No value flow.

#### `COURCurve.initialBuy()` — `OnlyFactory`
Atomic creator buy inside launch (fee charged, tax exempt, cannot graduate). Call chain: `→ _buy → stock.transferFrom → token.transfer → FeeVault.notify`. Value: stock → curve/vault, token → feeRecipient.

#### `COURFactory.graduate()` — `OnlyCurve` (`msg.sender == curveOf[token]`)
Pulls curve balances, delegatecalls `GraduationImpl.graduate`. Call chain: `→ stock/token.transferFrom(curve) → GraduationImpl.graduate (delegatecall) → PoolManager.initialize + PositionManager mint → DEAD → FeeVault.creditPlatform`. Value: curve → factory → v4 pool / DEAD / vault.

### Vault accrual & claims

#### `COURFeeVault.registerToken()` — `OnlyFactory`
Binds stock/creator/curve/feeRecipient/mode once. No value flow.

#### `COURFeeVault.notify()` — hook or token's curve only
Splits an already-transferred fee 20/80 by mode. State: `platformOwed`, `creatorOwed`/`accPerShare`/`buybackOwed`. No transfer.

#### `COURFeeVault.creditPlatform()` — `OnlyFactory`
Credits graduation stock dust to the platform bucket (stock already transferred by impl).

#### `COURFeeVault.beforeBalanceChange()` — token self-report (`msg.sender == token`)
Dividend bookkeeping in HOLDERS mode; no-op for other callers/modes. State: `_pending`, `_debt`, `eligibleSupply`.

#### `COURFeeVault.claim()` — `feeRecipient` only
CREATOR-bucket payout. Value: stock → feeRecipient.

#### `COURFeeVault.setFeeRecipient()` / `acceptFeeRecipient()` — `feeRecipient` / `pendingRecipient`
Two-step recipient rotation. No value flow.

#### `COURFeeVault.executeBuyback()` — `feeRecipient` only (modes 2/3)
Spends `buybackOwed` on curve (pre-grad) or v4 pool (post-grad) under min-USD + 2%-reserve + 3%-deviation guards. Value: vault stock → curve/pool; tokens → feeRecipient or DEAD.

### Hook callbacks (PoolManager only)

#### `COURHook.beforeInitialize()` — `onlyPoolManager` + `sender == factory`
Gates pool creation (fee 0, spacing 60, COUR token + its stock); seeds `_pool`/`_obs`.

#### `COURHook.beforeSwap()` — `onlyPoolManager`
Buy-side fee+tax capture via `BeforeSwapDelta` + `poolManager.take`; updates TWAP accumulator; vault exempt.

#### `COURHook.afterSwap()` — `onlyPoolManager`
Sell-side fee capture via return delta + `take`; vault exempt.

### Swap callback (inherited)

#### `PoolManagerSwapper.unlockCallback()` — `msg.sender == PoolManager`
Executes the exact-input swap and settles deltas. Inherited by `COURFeeVault` and `COURRouter`.

#### `COURPriceReader.setRefPool()` — owner or `authorizedSetter` (factory)
Binds a stock's reference v3 pool + kind.

---

## Admin-Only

| Contract | Function | Parameters | State Modified |
|----------|----------|------------|----------------|
| COURFactory | `setStock()` | stock, allowed, refPool, kind | `stockAllowed`, (→ priceReader.setRefPool) |
| COURFactory | `setLaunchParams()` | startMcUsd, gradMcUsd, minRefLiqUsd, launchFee | `startMcUsd`, `gradMcUsd`, `minRefLiqUsd`, `launchFee` |
| COURFactory | `setLaunchesPaused()` | paused | `launchesPaused` |
| COURFactory | `setLaunchAllowlist()` | account, allowed | `launchAllowlist` |
| COURFactory | `setLaunchAllowlistEnabled()` | enabled | `launchAllowlistEnabled` |
| COURFeeVault | `wire()` | factory, hook, router, priceReader | `factory`, `hook`, `router`, `priceReader`, `_wired` (one-shot) |
| COURFeeVault | `setTreasury()` | t | `treasury` |
| COURFeeVault | `setMinBuybackUsd()` | v | `minBuybackUsd` |
| COURPriceReader | `setAuthorizedSetter()` | setter | `authorizedSetter` |
| COURPriceReader | `setWethUsdgPool()` | pool | `wethUsdgPool` |
| COURPriceReader | `setTwapWindow()` | w (≥60) | `twapWindow` |
| COURRouter | `setEthInPath()` | stock, path | `ethInPath[stock]` |

> `Ownable2Step` on Factory, FeeVault, PriceReader, Router — each has `transferOwnership()`/`acceptOwnership()` (two-step; omitted from the table as standard OZ inherited functions).
