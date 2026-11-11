// Injected EIP-1193 + EIP-6963 mock wallet for the deterministic UI E2E.
// It answers connect/chain requests so the connect flow works WITHOUT a chain.
// Reads/writes that would hit a contract are not exercised by the mock spec
// (those are covered by the env-gated fork spec). Injected via addInitScript.
(() => {
  const CHAIN_ID = "0x1237"; // 4663
  const ACCOUNT = "0x1eb25d02fc7C5487D4648a602c355dBC2301030b";
  const listeners = {};
  const provider = {
    isMetaMask: true,
    _accounts: [],
    request: async ({ method, params }) => {
      switch (method) {
        case "eth_chainId":
          return CHAIN_ID;
        case "eth_accounts":
          return provider._accounts;
        case "eth_requestAccounts":
          provider._accounts = [ACCOUNT];
          emit("accountsChanged", provider._accounts);
          return provider._accounts;
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "net_version":
          return "4663";
        default:
          // The mock spec does not drive contract calls through the wallet.
          throw Object.assign(new Error(`mock wallet: ${method} not supported`), { code: 4200 });
      }
    },
    on: (ev, cb) => {
      (listeners[ev] = listeners[ev] || []).push(cb);
    },
    removeListener: (ev, cb) => {
      listeners[ev] = (listeners[ev] || []).filter((f) => f !== cb);
    },
  };
  function emit(ev, data) {
    (listeners[ev] || []).forEach((cb) => {
      try {
        cb(data);
      } catch {}
    });
  }
  window.ethereum = provider;

  // EIP-6963 announce so the app's wallet discovery finds it.
  const info = {
    uuid: "11111111-1111-1111-1111-111111111111",
    name: "Mock Wallet",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    rdns: "io.cour.mock",
  };
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }),
    );
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
