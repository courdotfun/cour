#!/usr/bin/env bash
# Verify the ACTIVE COUR deployment on robin.etherscan.io (Etherscan API v2, chainId 4663).
# Requires ETHERSCAN_API_KEY in the environment (free key from robin.etherscan.io). The explorer's
# Blockscout API is behind Cloudflare and rejects automated calls, so use the Etherscan v2 path below
# (or verify via the Blockscout browser UI with Standard-JSON input from out/).
# Usage: ETHERSCAN_API_KEY=xxxx bash deployments/verify-4663.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ETHERSCAN_API_KEY:?set ETHERSCAN_API_KEY}"
VU='https://api.etherscan.io/v2/api?chainid=4663'
V="forge verify-contract --verifier etherscan --verifier-url $VU --etherscan-api-key $ETHERSCAN_API_KEY --chain 4663 --watch --compiler-version 0.8.26"

DEP=0x1eb25d02fc7C5487D4648a602c355dBC2301030b
PM=0x8366a39CC670B4001A1121B8F6A443A643e40951; POSM=0x58daec3116aae6D93017bAAea7749052E8a04fA7
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168; WETH=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
V3R=0xCaf681a66D020601342297493863E78C959E5cb2

# ACTIVE deployment (deployments/4663.json)
PR=0x7Fc9b037c9FA9B4b305f3Ce1474E5435Ef8b88B1
FV=0x908C1B98C4F7FA9dd11A65ea5739d7030d6802bC
CI=0x9a7e7B3dF3fD1c30B328f2498996c3C3d2706213
HOOK=0xEde81409313e7350B1952fa4cfdD4A51f1cda0cc
FAC=0x2EA5E113f88A1C79F1A489fbef789578f10a070A
GI=0x3eb6e58f663d89bec653809d00959c9e1101da30
ROUTER=0xD9C66211F35C891C2dBfd80985363EA6da5C2006

$V $GI     src/GraduationImpl.sol:GraduationImpl
$V $PR     src/COURPriceReader.sol:COURPriceReader --constructor-args "$(cast abi-encode 'c(address,address,address)' $DEP $USDG $WETH)"
$V $FV     src/COURFeeVault.sol:COURFeeVault     --constructor-args "$(cast abi-encode 'c(address,address,address)' $DEP $DEP $PM)"
$V $CI     src/COURCurve.sol:COURCurve           --constructor-args "$(cast abi-encode 'c(address,address)' $FAC $FV)"
$V $HOOK   src/COURHook.sol:COURHook             --constructor-args "$(cast abi-encode 'c(address,address,address)' $PM $FAC $FV)"
$V $FAC    src/COURFactory.sol:COURFactory       --constructor-args "$(cast abi-encode 'c(address,address,address,address,address,address,address,address)' $DEP $PM $POSM $HOOK $FV $PR $CI $GI)"
$V $ROUTER src/COURRouter.sol:COURRouter         --constructor-args "$(cast abi-encode 'c(address,address,address,address,address)' $DEP $PM $FAC $V3R $WETH)"
echo "All verify requests submitted."
