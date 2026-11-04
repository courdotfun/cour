# Contract Verification — COUR final deployment (chain 4663)

Deployment: tag `audit-freeze-v1` (source freeze `458c358`), `deployments/4663.json`.
Compiler: solc 0.8.26, `via_ir=true`, `optimizer_runs=44444444`, `evm_version=cancun`.

## Status

| Contract | Address | robin.etherscan.io (Etherscan v2) | Blockscout | On-chain runtime |
|---|---|---|---|---|
| GraduationImpl | `0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7` | ✅ Verified | ⏳ manual (std-json ready) | 7,143 B |
| COURPriceReader | `0xF7C914E7B7580a7653DcC3b7574bf041F615e359` | ✅ Verified | ⏳ manual | 9,995 B |
| COURFeeVault | `0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76` | ✅ Verified | ⏳ manual | 14,624 B |
| COURCurve (impl) | `0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00` | ✅ Verified | ⏳ manual | 8,757 B |
| COURHook | `0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC` | ✅ Verified | ⏳ manual | 13,997 B |
| COURFactory | `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C` | ✅ Verified | ⏳ manual | 21,516 B (< EIP-170 24,576) |
| COURRouter | `0x835Afd54F9BA20b18b6807B44886123E85A586f9` | ✅ Verified | ⏳ manual | 11,679 B |

Curve clones are EIP-1167 minimal proxies to the verified `COURCurve` impl (Blockscout/Etherscan detect
the proxy → impl automatically). The CSMOKE test token (`0x9662F473D5810aa832ed4282bCB0b0F3348fA7bC`) is a
`COURToken` — verify on demand (source `src/COURToken.sol`, constructor args: name/symbol/metadataURI/curve/
stock/creator/holderRewards).

## robin.etherscan.io (automated — DONE)
`ETHERSCAN_API_KEY=xxxx bash deployments/verify-4663.sh` — all 7 submitted and returned **Pass - Verified**
via Etherscan API v2 (`https://api.etherscan.io/v2/api?chainid=4663`). This is the authoritative
bytecode↔source proof: Etherscan recompiled the exact `audit-freeze-v1` source and matched the deployed
bytecode (accounting for constructor args / immutables).

## Blockscout (manual — API behind Cloudflare)
`robinhoodchain.blockscout.com` API rejects automated calls (Cloudflare challenge). Standard-JSON inputs are
pre-generated in `deployments/verify-blockscout/<Name>.standard.json`. For each contract, in the Blockscout
UI (Verify & Publish → "Solidity (Standard JSON Input)"):
1. Compiler `v0.8.26`, paste the matching `*.standard.json`.
2. Constructor args (ABI-encoded, no `0x` prefix needed in some UIs):
   - GraduationImpl: *(none)*
   - COURPriceReader: `000…1eb25d02…030b` + usdg + weth — full value in `deployments/verify-blockscout/args.txt`.
   - (all args listed in `deployments/verify-blockscout/args.txt`)

## Reproducibility (anyone can re-derive)
`git checkout audit-freeze-v1 && ./bootstrap.sh && forge build`, then `forge inspect src/<C>.sol:<C> bytecode`
→ sha256 of the creation bytecode must equal:

| Contract | creation-bytecode sha256 |
|---|---|
| GraduationImpl | `7fedd3f189b3d79564156974333562a07c4e61085488f52eacba3407a92077d9` |
| COURPriceReader | `e104c0118e82201574177c4c379980bd53c27cba439c186373aafc1b16bdce1b` |
| COURFeeVault | `a740d0515cf0b00c93f06a078afd12189fdbe08c1411e473864963361ebe0946` |
| COURCurve | `3ffd48bba01bc790f050120997c169d891d6944de02d0afa6fb5a8729ac53e7d` |
| COURHook | `d26b72d81a72db06dc388f4c114c994d2faaa18554c8506fda4b8cc4e15e9a69` |
| COURFactory | `281b72c2c4cfd154e2ccdf6cb257b34d8ff518572a6de58c2bdacaf3bd59eb7d` |
| COURRouter | `935c71f5c1648a2d0cee2db5ef59e34daed86dd6f2ca11432ceb41833b39b7d6` |

## Deprecated deployments (lower priority)
The paused factories `0x2EA5…070A` (029b233) and `0x8e27…8D42` are OLDER code (pre L-2/L-3/L-4) and require a
build from their historical commits to verify — deferred (they are paused and unused). Tracked in
`deployments/4663-DEPRECATED.json`.
