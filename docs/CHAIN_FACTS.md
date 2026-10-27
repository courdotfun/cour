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

## Verified / Corrected

- **Not yet verified on-chain.** No `RH_RPC_URL`/network was available in the build environment, so `script/00_VerifyChain.s.sol` and the fork tests (`test/fork/ForkChain.t.sol`) were NOT executed against mainnet. They are authored to check code presence, NVDA `decimals()`/`uiMultiplier()`, and a v3 TWAP sanity range, and must be run by a human with an RPC before deployment. **TODO for the human.**
- Spec addresses for `NVDA` and `NVDA/USDG pool` were given lowercase; corrected to EIP-55 checksums above (and in `test/fork/ForkChain.t.sol`).
- `wethUsdgPool` is unknown and left as `0x0` in `script/config/rh-mainnet.json`; required only if any stock is priced via the WETH route. **TODO: fill if needed.**
- Other canonical stock tokens (TSLA, AAPL, SPY, …) and their v3 USDG pools were not discovered (no RPC). **TODO: enumerate from on-chain v3 USDG pools and add to the allowlist config.**

## EVM / transient storage

- Contracts compile for `evm_version = "cancun"` (transient storage used by v4-core and by COUR reentrancy guards). Robinhood Chain Cancun support was **not** verified on a fork; confirm before mainnet. If unsupported, swap `ReentrancyGuardTransient` for the storage-based guard and re-test.

## Quirks honoured

- Robinhood Universal Router's v4 struct has an extra `minHopPriceX36` field → COUR core never uses it; `COURRouter` and `COURFeeVault` swap against the PoolManager directly via `unlock`.
- Stock tokens are ERC-20 + ERC-8056; all COUR accounting uses **raw** amounts. Decimals are read via `decimals()`, never assumed (tested 6/8/18).
- Stock tokens may be paused → only transfers/claims revert transiently; accrual accounting never corrupts.
