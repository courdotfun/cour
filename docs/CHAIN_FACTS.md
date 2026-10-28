# Chain Facts (Robinhood Chain)

Arbitrum Orbit L2, gas token ETH, sub-second blocks (multiple blocks/second → use `block.timestamp`, never block numbers). Explorer: Blockscout (https://robinhoodchain.blockscout.com).

| Item | Value |
|---|---|
| Mainnet chainId | 4663 |
| Testnet chainId | 46630 |
| Testnet RPC | https://rpc.testnet.chain.robinhood.com |
| Mainnet RPC | `.env` `RH_RPC_URL` |

## Mainnet addresses (from spec §2; EIP-55 checksummed)

| Contract | Address |
|---|---|
| v4 PoolManager | 0x8366a39CC670B4001A1121B8F6A443A643e40951 |
| v4 PositionManager | 0x58daec3116aae6D93017bAAea7749052E8a04fA7 |
| v4 StateView | 0xf3334192D15450CDD385C8b70e03F9a6BD9e673b |
| v4 Quoter | 0x8dC178EFb8111bb0973dd9d722ebEFF267C98f94 |
| Universal Router (RH fork) | 0x8876789976DEcbFcbBbE364623c63652Db8c0904 |
| Universal Router 2.1.2 (alt) | 0x204FAca1764B154221e35c0d20aBb3c525710498 |
| Permit2 | 0x000000000022D473030F116dDEE9F6B43aC78BA3 |
| v3 Factory | 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA |
| v3 NonfungiblePositionManager | 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3 |
| v3 SwapRouter02 | 0xCaf681a66D020601342297493863E78C959E5cb2 |
| v3 QuoterV2 | 0x33e885eD0eC9BF04EcFB19341582AAdCB4c8A9E7 |
| Multicall | 0x282a3c4D320cC7f0d5EaF56b8029e4b88338F0a3 |
| WETH | 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73 |
| USDG (stablecoin) | 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 |
| NVDA stock token | 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC |
| v3 NVDA/USDG pool (~$3M) | 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3 |

## Verified on-chain 2026-10-29 (mainnet, chainId 4663, block ~100.3M)

RPC: `https://rpc.mainnet.chain.robinhood.com` (the public endpoint; the `.env.example` host
`rpc.chain.robinhood.com` is dead — the correct host has `mainnet.`). Verified with `cast`:

- **Code present at every spec address** (PoolManager, PositionManager, StateView, v3 Factory,
  SwapRouter02, Permit2, WETH, USDG, NVDA, NVDA/USDG pool). ✓
- **NVDA** (`0xd060…9EEC`): `decimals()=18`, `symbol()="NVDA"`, `name()="NVIDIA • Robinhood Token"`,
  `totalSupply()=86,899.41e18`, ERC-8056 `uiMultiplier()=1.000775e18`. ✓
- **USDG** (`0x5fc5…d168`): `decimals()=6`, `symbol()="USDG"`. **WETH** `symbol()="WETH"`.
- **NVDA/USDG v3 pool** (`0xd4EB…14a3`): `token0=USDG`, `token1=NVDA`, `fee=500` (0.05%),
  `liquidity=1.811e18`, `slot0.sqrtPriceX96=5.4195e33`, `tick=222674`, `observationCardinality=7200`,
  `observationIndex=4353`. Implied NVDA ≈ **$214** — sane. The canonical NVDA/USDG pool is the fee-500
  tier; the factory also lists NVDA/USDG pools at fee 100/3000/10000.
- **WETH/USDG pools** exist at all four tiers; most liquid is **fee=100**
  (`0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca`, L=1.995e18, token0=WETH). Recorded as `wethUsdgPool`
  in `script/config/rh-mainnet.json` for the buyWithETH route (WETH -(100)- USDG -(500)- NVDA).
- **PositionManager** (`0x58da…4fA7`): `name()="Uniswap v4 Positions NFT"`, `symbol()="UNI-V4-POSM"`,
  `nextTokenId()=4,057,600`, `poolManager()` and `permit2()` match the config. The vendored v4-periphery
  `PositionManager` ABI (nextTokenId / modifyLiquidities / ownerOf / getPositionLiquidity) matches the
  live contract — the graduation mint path (§2.3) targets the real contract.
- Spec addresses for `NVDA` and `NVDA/USDG pool` corrected to EIP-55 checksums.
- **TODO (not blocking the NVDA-only closed test):** enumerate the other canonical stock tokens
  (TSLA/AAPL/SPY/…) and their v3 USDG pools from `PoolCreated` events and add to the allowlist config.

## EVM / transient storage — CANCUN CONFIRMED

The live v4 **PoolManager** (`0x8366…0951`) uses transient storage (TSTORE/TLOAD) extensively and is
deployed and actively used on mainnet (the NVDA/USDG pool has `observationIndex=4353` of a 7200-slot
ring — i.e. it has been swapped against many times). A contract that requires Cancun transient storage
could not function otherwise, so **Cancun / transient storage is supported on Robinhood Chain.** The
COUR `ReentrancyGuardTransient` guards and v4-core both rely on this. (A dedicated TSTORE/TLOAD probe is
also run on the anvil fork during the deploy rehearsal.)

## Quirks honoured

- Robinhood Universal Router's v4 struct has an extra `minHopPriceX36` field → COUR core never uses it; `COURRouter` and `COURFeeVault` swap against the PoolManager directly via `unlock`.
- Stock tokens are ERC-20 + ERC-8056; all COUR accounting uses **raw** amounts. Decimals are read via `decimals()`, never assumed (tested 6/8/18).
- Stock tokens may be paused → only transfers/claims revert transiently; accrual accounting never corrupts.
