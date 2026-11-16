// Build an acceptOwnership MultiSend EIP-712 JSON for the E2E test, targeting the
// four MOCK contract addresses (not the production ones). Mirrors
// script/safe/accept-ownership.sh packing, but parameterised.
// Usage: node build-accept-json.mjs <out.json> <chainId> <safe> <nonce> <a1> <a2> <a3> <a4>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// load vendored ethers (UMD → CJS global)
const umd = readFileSync(join(here, "..", "vendor", "ethers-6.13.4.umd.min.js"), "utf8");
const mod = { exports: {} };
new Function("module", "exports", umd)(mod, mod.exports);
const ethers = mod.exports.ethers || mod.exports;

const [, , out, chainId, safe, nonce, ...targets] = process.argv;
const MULTISEND = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";
const ACCEPT = "0x79ba5097"; // acceptOwnership()
const ZERO = "0x0000000000000000000000000000000000000000";

function pack(to) {
  const t = ethers.getAddress(to).slice(2).toLowerCase();
  const op = "00";
  const val = "0".repeat(64);
  const dataLen = (ACCEPT.length - 2) / 2;
  const len = dataLen.toString(16).padStart(64, "0");
  return op + t + val + len + ACCEPT.slice(2);
}
const packed = "0x" + targets.map(pack).join("");
const iface = new ethers.Interface(["function multiSend(bytes transactions)"]);
const data = iface.encodeFunctionData("multiSend", [packed]);

const typed = {
  types: {
    EIP712Domain: [
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    SafeTx: [
      { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "data", type: "bytes" }, { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" }, { name: "nonce", type: "uint256" },
    ],
  },
  primaryType: "SafeTx",
  domain: { chainId: Number(chainId), verifyingContract: ethers.getAddress(safe) },
  message: {
    to: MULTISEND, value: "0", data, operation: 1,
    safeTxGas: "0", baseGas: "0", gasPrice: "0", gasToken: ZERO, refundReceiver: ZERO,
    nonce: String(nonce),
  },
};
writeFileSync(out, JSON.stringify(typed, null, 2));
// also print the locally-computed safeTxHash so the harness can cross-check vs cast
const hash = ethers.TypedDataEncoder.hash(
  { chainId: Number(chainId), verifyingContract: ethers.getAddress(safe) },
  { SafeTx: typed.types.SafeTx }, typed.message);
process.stdout.write(hash);
