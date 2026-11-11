// COUR real-app entry. Bundled by Vite and loaded as a module AFTER the legacy
// design script has defined its adapters. It:
//   1. replaces the demo wallet adapter (COUR_WALLET) with a real viem + EIP-6963
//      implementation (mutating the existing object so the design's closures see it);
//   2. exposes a typed `window.COUR` runtime API (chain / data / features);
//   3. gates the Launch button on the on-chain allowlist;
//   4. boots real data from the indexer (+ on-chain fallback) and seeds real
//      prices into COUR_PX so no fabricated numbers are shown (COUR_LIVE mode);
//   5. mounts an owner-only admin (treasury / fees) panel.
import { publicClient, robinhoodChain, CHAIN_ID } from "./chain/client";
import {
  deployment,
  extraAddresses,
  explorerAddress,
  explorerTx,
  explorerToken,
  DEAD_ADDRESS,
} from "./chain/deployment";
import {
  connect as walletConnect,
  disconnect as walletDisconnect,
  ensureChain,
  getWallet,
  listProviders,
  onProviders,
  onWalletChange,
  type EIP6963ProviderDetail,
} from "./chain/wallet";
import { indexer, indexerConfigured } from "./data/indexer";
import * as onchain from "./data/onchain";
import * as trade from "./features/trade";
import * as launch from "./features/launch";
import * as claims from "./features/claims";
import * as stockswap from "./features/stockswap";
import * as format from "./ui/format";
import { feeModeLabel } from "./data/types";
import type { Hex, TokenRow } from "./data/types";
import { installLive } from "./live/wire";

// ---------------------------------------------------------------------------
// 1. Real wallet adapter — mutate the existing COUR_WALLET object in place.
// ---------------------------------------------------------------------------
function pickProvider(via?: string): EIP6963ProviderDetail | null {
  const providers = listProviders();
  if (providers.length === 0) return null;
  if (via) {
    const want = via.toLowerCase();
    const match = providers.find(
      (p) =>
        p.info.name.toLowerCase().includes(want) ||
        (want.includes("metamask") && p.info.name.toLowerCase().includes("metamask")) ||
        (want.includes("coinbase") && p.info.name.toLowerCase().includes("coinbase")),
    );
    if (match) return match;
  }
  return providers[0];
}

function installWalletAdapter() {
  const adapter = window.COUR_WALLET;
  if (!adapter) return;

  adapter.connect = async (via?: string) => {
    const detail = pickProvider(via);
    if (!detail) {
      throw new Error(
        "No wallet found. Install a browser wallet (e.g. MetaMask) or use WalletConnect.",
      );
    }
    const st = await walletConnect(detail.provider);
    try {
      await ensureChain();
    } catch {
      /* user may decline the network switch; still connected */
    }
    return { addr: st.address as string, via: via ?? detail.info.name };
  };

  adapter.disconnect = async () => {
    walletDisconnect();
  };

  // send / swap: route through real transfers where the asset maps to a known
  // token; otherwise reject clearly instead of faking a tx hash.
  adapter.send = async () => {
    throw new Error(
      "Direct send from the demo wallet view is not wired to chain yet. Use a token page to trade, or your wallet app to transfer.",
    );
  };
  adapter.swap = async () => {
    throw new Error(
      "Use a token page (buy/sell via COURRouter) or a stock page (SwapRouter02) to trade on-chain.",
    );
  };
}

// ---------------------------------------------------------------------------
// 2. Connect UI — surface discovered EIP-6963 wallets in the connect modal.
// ---------------------------------------------------------------------------
function renderDiscoveredWallets() {
  const list = document.getElementById("cwList");
  if (!list) return;
  const providers = listProviders();
  // Remove previously injected dynamic options.
  list.querySelectorAll("[data-cour-dynamic]").forEach((n) => n.remove());
  for (const p of providers) {
    // Skip if a static option already covers this wallet by name.
    const name = p.info.name;
    const exists = [...list.querySelectorAll(".cw-opt")].some(
      (b) => (b as HTMLElement).dataset.w?.toLowerCase() === name.toLowerCase(),
    );
    if (exists) continue;
    const btn = document.createElement("button");
    btn.className = "cw-opt";
    btn.dataset.w = name;
    btn.dataset.courDynamic = "1";
    btn.innerHTML =
      (p.info.icon
        ? `<span class="cw-ic"><img src="${p.info.icon}" alt="" width="22" height="22"></span>`
        : `<span class="cw-ic"></span>`) +
      `<span><b>${name}</b><small>Detected wallet</small></span>`;
    btn.onclick = () => {
      // Reuse the design's connect flow if present, else connect directly.
      const w = window as any;
      if (typeof w.openConnect === "function") {
        // Let the existing handler drive the UI; it calls COUR_WALLET.connect(via).
      }
      adapterConnectViaUI(name);
    };
    list.appendChild(btn);
  }
}

async function adapterConnectViaUI(via: string) {
  try {
    const wait = document.getElementById("cwWait");
    const listEl = document.getElementById("cwList");
    if (listEl) listEl.style.display = "none";
    if (wait) wait.classList.add("on");
    await window.COUR_WALLET!.connect(via);
    const w = window as any;
    if (typeof w.closeConnect === "function") w.closeConnect();
    if (typeof w.renderHeader === "function") w.renderHeader();
    if (typeof w.refreshAll === "function") w.refreshAll();
  } catch (e: any) {
    const wait = document.getElementById("cwWait");
    if (wait) wait.classList.remove("on");
    const listEl = document.getElementById("cwList");
    if (listEl) listEl.style.display = "";
    alert(e?.message ?? "Connection failed");
  }
}

// ---------------------------------------------------------------------------
// 3. Launch allowlist gating.
// ---------------------------------------------------------------------------
async function refreshLaunchGate() {
  const btn = document.getElementById("ctLaunch") as HTMLButtonElement | null;
  if (!btn) return;
  const { address } = getWallet();
  if (!address) {
    btn.disabled = false; // design handles "connect first"
    btn.removeAttribute("data-cour-gated");
    return;
  }
  const allowed = await onchain.isLaunchAllowed(address);
  if (!allowed) {
    btn.disabled = true;
    btn.textContent = "Launches are invite-only during beta";
    btn.title = "Your wallet is not on the launch allowlist.";
    btn.dataset.courGated = "1";
  } else if (btn.dataset.courGated) {
    btn.disabled = false;
    btn.textContent = "Launch token";
    btn.removeAttribute("title");
    btn.removeAttribute("data-cour-gated");
  }
}

// ---------------------------------------------------------------------------
// 4. Data boot — real tokens/stats + real price seeding.
// ---------------------------------------------------------------------------
interface BootState {
  tokens: TokenRow[];
  stats: unknown | null;
  indexerUp: boolean;
  seededPrices: Record<string, number>;
}

const state: BootState = { tokens: [], stats: null, indexerUp: false, seededPrices: {} };

async function seedRealPrices() {
  window.COUR_PX = window.COUR_PX || {};
  // From the indexer token list (preferred).
  for (const t of state.tokens) {
    const sym = (t.symbol || "").toUpperCase();
    if (sym && t.lastPriceUsd != null && isFinite(t.lastPriceUsd)) {
      window.COUR_PX[sym] = t.lastPriceUsd;
      state.seededPrices[sym] = t.lastPriceUsd;
    }
  }
  // Always try the live CSMOKE test token directly on-chain so the UI shows at
  // least one real price even with no indexer.
  try {
    const curve = await onchain.curveOf(extraAddresses.csmoke);
    if (curve) {
      const snap = await onchain.curveSnapshot(curve);
      if (snap) {
        const usd = await onchain.stockUsdPrice(snap.stock);
        // price in stock units ~ vS/vT; convert to USD when we have the stock price.
        if (snap.vT > 0n && usd != null) {
          const priceStock = Number(snap.vS) / Number(snap.vT);
          const priceUsd = priceStock * usd;
          if (isFinite(priceUsd) && priceUsd > 0) {
            window.COUR_PX["CSMOKE"] = priceUsd;
            state.seededPrices["CSMOKE"] = priceUsd;
          }
        }
      }
    }
  } catch {
    /* non-fatal */
  }
}

async function bootData() {
  state.indexerUp = indexerConfigured();
  if (state.indexerUp) {
    const res = await indexer.tokens("trending", 50);
    if (res.ok) {
      state.tokens = res.data.tokens;
    } else {
      state.indexerUp = false;
      console.warn("[COUR] indexer unavailable:", res.error);
    }
    const s = await indexer.stats();
    if (s.ok) state.stats = s.data;
  } else {
    console.info(
      "[COUR] VITE_INDEXER_URL not set — lists use on-chain reads only; prices/quotes still live via viem.",
    );
  }
  await seedRealPrices();
  window.dispatchEvent(new CustomEvent("cour:data", { detail: { ...state } }));
}

// ---------------------------------------------------------------------------
// 5. Owner-only admin panel (treasury / platform fees).
// ---------------------------------------------------------------------------
async function maybeMountAdmin() {
  const { address } = getWallet();
  if (!address) return;
  let owner: Hex;
  try {
    owner = await onchain.factoryOwner();
  } catch {
    return;
  }
  if (owner.toLowerCase() !== address.toLowerCase()) {
    document.getElementById("courAdmin")?.remove();
    return;
  }
  if (document.getElementById("courAdmin")) return;

  const [usdgOwed, wethOwed] = await Promise.all([
    onchain.platformOwed(deployment.usdg).catch(() => 0n),
    onchain.platformOwed(deployment.weth).catch(() => 0n),
  ]);

  const panel = document.createElement("div");
  panel.id = "courAdmin";
  panel.style.cssText =
    "position:fixed;right:12px;bottom:84px;z-index:9999;max-width:300px;background:var(--surface,#111);color:var(--text,#fff);border:1px solid var(--border,#333);border-radius:14px;padding:14px;font:13px/1.4 var(--sans,system-ui);box-shadow:0 8px 30px rgba(0,0,0,.4)";
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <b>Admin · Treasury</b>
      <button id="courAdminX" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px">×</button>
    </div>
    <div style="font-size:11px;opacity:.7;margin-bottom:8px">Owner-only. Visible because the connected wallet is factory.owner().</div>
    <div>Platform owed (USDG): <b>${format.fromRaw(usdgOwed, 18).toFixed(4)}</b></div>
    <div>Platform owed (WETH): <b>${format.fromRaw(wethOwed, 18).toFixed(6)}</b></div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button id="courClaimUsdg" class="btn-connect" style="flex:1">Claim USDG</button>
      <button id="courClaimWeth" class="btn-connect" style="flex:1">Claim WETH</button>
    </div>
    <a href="${explorerAddress(deployment.feeVault)}" target="_blank" rel="noopener" style="display:block;margin-top:8px;font-size:11px;opacity:.8">FeeVault on explorer ↗</a>`;
  document.body.appendChild(panel);
  panel.querySelector<HTMLButtonElement>("#courAdminX")!.onclick = () => panel.remove();
  panel.querySelector<HTMLButtonElement>("#courClaimUsdg")!.onclick = () =>
    claims.claimPlatform(deployment.usdg).then((h) => alert("Claimed. Tx: " + h)).catch((e) => alert(e.message));
  panel.querySelector<HTMLButtonElement>("#courClaimWeth")!.onclick = () =>
    claims.claimPlatform(deployment.weth).then((h) => alert("Claimed. Tx: " + h)).catch((e) => alert(e.message));
}

// ---------------------------------------------------------------------------
// window.COUR — public runtime API (also used by the smoke test).
// ---------------------------------------------------------------------------
function exposeApi() {
  window.COUR = {
    chain: { publicClient, robinhoodChain, CHAIN_ID, deployment, extraAddresses, DEAD_ADDRESS },
    explorer: { address: explorerAddress, tx: explorerTx, token: explorerToken },
    wallet: {
      connect: (via?: string) => window.COUR_WALLET!.connect(via),
      disconnect: () => window.COUR_WALLET!.disconnect(),
      get: getWallet,
      providers: listProviders,
    },
    data: { indexer, onchain, feeModeLabel },
    features: { trade, launch, claims, stockswap },
    format,
    state,
    config: {
      indexerConfigured: indexerConfigured(),
      pinataConfigured: launch.pinataConfigured(),
      rpc: import.meta.env.VITE_RPC_URL ?? "(default)",
    },
  };
}

// ---------------------------------------------------------------------------
// Bootstrap.
// ---------------------------------------------------------------------------
function init() {
  try {
    installWalletAdapter();
    exposeApi();
    renderDiscoveredWallets();
    onProviders(() => renderDiscoveredWallets());
    onWalletChange(() => {
      refreshLaunchGate().catch(() => {});
      maybeMountAdmin().catch(() => {});
    });
    bootData().catch((e) => console.warn("[COUR] data boot failed:", e));
    // Install the live wiring: drive the design's render paths + buy/sell/launch
    // handlers with REAL indexer + on-chain data (replaces the demo flows).
    installLive();
    // Re-check the launch gate when the user navigates (design uses showView).
    const w = window as any;
    if (typeof w.showView === "function") {
      const orig = w.showView;
      w.showView = function (...args: unknown[]) {
        const r = orig.apply(this, args);
        setTimeout(() => refreshLaunchGate().catch(() => {}), 0);
        return r;
      };
    }
    console.info("[COUR] real app layer initialised. Try window.COUR in the console.");
  } catch (e) {
    console.error("[COUR] init error", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
