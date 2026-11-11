// Prepare an anvil fork of Robinhood Chain (4663) for the full UI fork E2E:
//   - give the test account ETH (anvil_setBalance)
//   - impersonate factory.owner() → setLaunchAllowlist(testAccount, true)
//   - (optional) transfer USDG/NVDA from a whale (FORK_USDG_WHALE / FORK_NVDA_WHALE)
//
// Usage (with anvil running, --auto-impersonate recommended):
//   FORK_RPC=http://127.0.0.1:8545 \
//   FORK_ACCOUNT=0x1eb2...030b \
//   [FORK_USDG_WHALE=0x... FORK_NVDA_WHALE=0x...] \
//   node e2e/fork-setup.mjs
import { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData } from "viem";
import deployment from "../public/deployment.json" assert { type: "json" };

const RPC = process.env.FORK_RPC || "http://127.0.0.1:8545";
const ACCOUNT = process.env.FORK_ACCOUNT || "0x1eb25d02fc7C5487D4648a602c355dBC2301030b";
const chain = { id: deployment.chainId, name: deployment.network, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };

const pub = createPublicClient({ chain, transport: http(RPC) });

async function rpc(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

const factoryAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "setLaunchAllowlist", stateMutability: "nonpayable", inputs: [{ name: "a", type: "address" }, { name: "ok", type: "bool" }], outputs: [] },
];
const erc20Abi = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amt", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
];

async function impersonatedSend(from, to, data) {
  await rpc("anvil_impersonateAccount", [from]);
  await rpc("anvil_setBalance", [from, "0x" + parseEther("1").toString(16)]);
  const hash = await rpc("eth_sendTransaction", [{ from, to, data, gas: "0x7a1200" }]);
  await pub.waitForTransactionReceipt({ hash });
  await rpc("anvil_stopImpersonatingAccount", [from]);
  return hash;
}

async function main() {
  console.log(`[fork-setup] RPC=${RPC} account=${ACCOUNT}`);
  // 1. ETH for gas.
  await rpc("anvil_setBalance", [ACCOUNT, "0x" + parseEther("10").toString(16)]);
  console.log("[fork-setup] funded 10 ETH");

  // 2. allowlist the test account (impersonate the owner).
  const owner = await pub.readContract({ address: deployment.factory, abi: factoryAbi, functionName: "owner" });
  await impersonatedSend(owner, deployment.factory, encodeFunctionData({ abi: factoryAbi, functionName: "setLaunchAllowlist", args: [ACCOUNT, true] }));
  console.log(`[fork-setup] allowlisted ${ACCOUNT} (owner ${owner})`);

  // 3. optional: seed stock balances from whales.
  const deals = [
    ["USDG", deployment.usdg, process.env.FORK_USDG_WHALE, 100000n * 10n ** 18n],
    ["NVDA", deployment.nvda, process.env.FORK_NVDA_WHALE, 1000n * 10n ** 18n],
  ];
  for (const [sym, token, whale, amt] of deals) {
    if (!whale) {
      console.log(`[fork-setup] ${sym}: set FORK_${sym}_WHALE to seed balances (skipped)`);
      continue;
    }
    await impersonatedSend(whale, token, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ACCOUNT, amt] }));
    const bal = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [ACCOUNT] });
    console.log(`[fork-setup] ${sym}: dealt, balance now ${bal}`);
  }
  console.log("[fork-setup] done. Build with VITE_RPC_URL=" + RPC + " then run pnpm e2e:fork.");
}

main().catch((e) => {
  console.error("[fork-setup] failed:", e.message);
  process.exit(1);
});
