#!/usr/bin/env bash
# Verify the ACTIVE (final, audit-freeze-v1) COUR deployment on robin.etherscan.io
# (Etherscan API v2, chainId 4663). Requires ETHERSCAN_API_KEY in the environment
# (free key from robin.etherscan.io). The Blockscout API is behind Cloudflare and rejects
# automated calls — for Blockscout use the browser UI with Standard-JSON input from out/
# (see deployments/verify-blockscout-standard-json/ produced by verify-4663-blockscout.sh).
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

# FINAL deployment (deployments/4663.json, tag audit-freeze-v1)
PR=0xF7C914E7B7580a7653DcC3b7574bf041F615e359
FV=0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76
CI=0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00
HOOK=0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC
FAC=0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C
GI=0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7
ROUTER=0x835Afd54F9BA20b18b6807B44886123E85A586f9

$V $GI     src/GraduationImpl.sol:GraduationImpl
$V $PR     src/COURPriceReader.sol:COURPriceReader --constructor-args "$(cast abi-encode 'c(address,address,address)' $DEP $USDG $WETH)"
$V $FV     src/COURFeeVault.sol:COURFeeVault     --constructor-args "$(cast abi-encode 'c(address,address,address)' $DEP $DEP $PM)"
$V $CI     src/COURCurve.sol:COURCurve           --constructor-args "$(cast abi-encode 'c(address,address)' $FAC $FV)"
$V $HOOK   src/COURHook.sol:COURHook             --constructor-args "$(cast abi-encode 'c(address,address,address)' $PM $FAC $FV)"
$V $FAC    src/COURFactory.sol:COURFactory       --constructor-args "$(cast abi-encode 'c(address,address,address,address,address,address,address,address)' $DEP $PM $POSM $HOOK $FV $PR $CI $GI)"
$V $ROUTER src/COURRouter.sol:COURRouter         --constructor-args "$(cast abi-encode 'c(address,address,address,address,address)' $DEP $PM $FAC $V3R $WETH)"
echo "All verify requests submitted."
