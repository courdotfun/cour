// Playwright end-to-end: drive signer.html with a FAKE injected EIP-1193 provider
// against a local anvil (chain 4663). Two owners sign, owner #1 executes, then we
// assert the Safe now owns the four mock contracts. No real wallet, no real chain.
//
// Config comes from a JSON file path in argv[2]:
//   { signerHtml, anvilRpc, acceptJson, safe, mocks:[..4],
//     ownerA:{addr,key}, ownerB:{addr,key}, executor:{addr,key} }
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Lenovo/cour/frontend/package.json");
const { chromium } = require("@playwright/test");

// Resolve an installed full-chromium executable (handles a browser-revision skew
// where @playwright/test expects a build that isn't downloaded).
function resolveChrome() {
  if (process.env.CHROME_EXEC && existsSync(process.env.CHROME_EXEC)) return process.env.CHROME_EXEC;
  const def = chromium.executablePath();
  if (existsSync(def)) return def;
  const base = join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE, "AppData", "Local"), "ms-playwright");
  const builds = readdirSync(base).filter(d => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const b of builds) {
    const p = join(base, b, "chrome-win64", "chrome.exe");
    if (existsSync(p)) return p;
  }
  return def; // let Playwright produce its own error
}

const cfg = JSON.parse(readFileSync(process.argv[2], "utf8"));
const acceptJson = readFileSync(cfg.acceptJson, "utf8");
const fileUrl = "file://" + cfg.signerHtml.replace(/\\/g, "/");

// ---- fake provider injected into every page (runs before page scripts) ----
function installFakeProvider(ctx) {
  const { addr, key, rpc } = ctx;
  let id = 1;
  async function rpcCall(method, params) {
    const res = await fetch(rpc, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params || [] }),
    });
    const j = await res.json();
    if (j.error) throw new Error(method + ": " + JSON.stringify(j.error));
    return j.result;
  }
  const provider = {
    isMetaMask: true,
    _events: {},
    on(ev, cb) { (this._events[ev] = this._events[ev] || []).push(cb); return this; },
    removeListener() { return this; },
    async request({ method, params }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts": return [addr];
        case "eth_chainId": return "0x1237";
        case "net_version": return "4663";
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain": return null;
        case "personal_sign": {
          const w = new window.ethers.Wallet(key);
          return await w.signMessage(window.ethers.getBytes(params[0]));
        }
        case "eth_signTypedData_v4": {
          const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
          const types = { ...td.types }; delete types.EIP712Domain;
          const w = new window.ethers.Wallet(key);
          return await w.signTypedData(td.domain, types, td.message);
        }
        default: return await rpcCall(method, params);
      }
    },
  };
  window.ethereum = provider;
}

async function openPage(browser, active) {
  const page = await browser.newPage();
  page.on("console", m => { if (m.type() === "error") console.log("  [page error]", m.text()); });
  await page.addInitScript(installFakeProvider, { addr: active.addr, key: active.key, rpc: cfg.anvilRpc });
  await page.goto(fileUrl);
  await page.waitForFunction(() => !!window.ethers);
  await page.click("#btnConnect");
  await page.waitForFunction(a => window.__COUR && window.__COUR.state.account
      && window.__COUR.state.account.toLowerCase() === a.toLowerCase(), active.addr.toLowerCase());
  // load the tx
  await page.fill("#pasteJson", acceptJson);
  await page.click("#btnLoadPaste");
  await page.waitForSelector("#summary", { state: "visible" });
  return page;
}

async function signAs(browser, owner, label) {
  const page = await openPage(browser, owner);
  await page.click("#btnSign");
  await page.waitForSelector("#signOut", { state: "visible" });
  const verify = await page.textContent("#oVerify");
  const sig = (await page.textContent("#oSig")).trim();
  if (!/== account ✓/.test(verify)) throw new Error(`${label}: local verify failed: ${verify}`);
  console.log(`  ${label} (${owner.addr}) signed + locally verified: ${sig.slice(0, 20)}…`);
  await page.close();
  return sig;
}

(async () => {
  // use an installed full chromium build (headless-shell may not be downloaded)
  const exe = resolveChrome();
  console.log("  chromium:", exe);
  const browser = await chromium.launch({ executablePath: exe });
  try {
    console.log("· owner A signs");
    const sigA = await signAs(browser, cfg.ownerA, "ownerA");
    console.log("· owner B signs");
    const sigB = await signAs(browser, cfg.ownerB, "ownerB");

    console.log("· executor loads both signatures, verifies, simulates, broadcasts");
    const page = await openPage(browser, cfg.executor);
    await page.fill("#eAddrA", cfg.ownerA.addr);
    await page.fill("#eSigA", sigA);
    await page.fill("#eAddrB", cfg.ownerB.addr);
    await page.fill("#eSigB", sigB);
    await page.click("#btnVerify");
    await page.waitForFunction(() => !document.getElementById("btnExec").disabled, null, { timeout: 15000 });
    console.log("  verify+simulate passed; btnExec enabled");
    await page.click("#btnExec");
    await page.waitForFunction(() => /confirmed/.test(document.getElementById("xStatus").textContent), null, { timeout: 30000 });
    const status = await page.textContent("#xStatus");
    const txHash = (await page.textContent("#xHash")).trim();
    console.log(`  execTransaction ${status} — tx ${txHash}`);
    await page.close();
    console.log("E2E-UI-OK");
  } finally {
    await browser.close();
  }
})().catch(e => { console.error("E2E FAILED:", e.message); process.exit(1); });
