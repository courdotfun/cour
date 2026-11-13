// Write the Safe EIP-712 SafeTx typed-data JSON for `cast wallet sign --data`.
// Pure node (no deps): cast computes the EIP-712 digest from this JSON and signs
// it (v=27/28) — the digest equals the Safe's getTransactionHash (verified in
// script/safe/simulate.sh).
//
// Usage: node make-712.mjs <outFile> <chainId> <safe> <to> <value> <data> <operation> <nonce>
import { writeFileSync } from "node:fs";
const [, , out, chainId, safe, to, value, data, operation, nonce] = process.argv;
const ZERO = "0x0000000000000000000000000000000000000000";
const typed = {
  types: {
    EIP712Domain: [
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    SafeTx: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
  },
  primaryType: "SafeTx",
  domain: { chainId: Number(chainId), verifyingContract: safe },
  message: {
    to,
    value: String(value),
    data,
    operation: Number(operation),
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: ZERO,
    refundReceiver: ZERO,
    nonce: String(nonce),
  },
};
writeFileSync(out, JSON.stringify(typed, null, 2));
console.error(`wrote ${out}`);
