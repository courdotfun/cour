"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { isAddress, parseEther, parseUnits } from "viem";
import { getWallet, requireWalletClient, ensureChain, connect } from "@/lib/chain/wallet";
import { publicClient } from "@/lib/chain/client";
import { deployment } from "@/lib/chain/deployment";

const transferAbi = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
import { shortAddr } from "@/lib/ui/format";

type Tab = "receive" | "send" | "swap";
const ASSETS = [
  { sym: "ETH", address: null as string | null, decimals: 18 },
  { sym: "NVDA", address: deployment.nvda, decimals: 18 },
];

export function WalletModal() {
  const [tab, setTab] = useState<Tab | null>(null);
  const [addr, setAddr] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const [asset, setAsset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = async (e: Event) => {
      const detail = (e as CustomEvent).detail as Tab;
      let a = getWallet().address;
      if (!a) { try { a = (await connect((window as any).ethereum)).address ?? null; } catch {} }
      setAddr(a);
      setTab(detail);
      setMsg(null);
      if (a) setQr(await QRCode.toDataURL(a, { margin: 1, width: 200 }));
    };
    window.addEventListener("cour:wallet", onOpen);
    return () => window.removeEventListener("cour:wallet", onOpen);
  }, []);

  if (!tab) return null;
  const close = () => setTab(null);
  const title = tab === "receive" ? "Receive" : tab === "send" ? "Send" : "Swap";

  async function send() {
    setMsg(null);
    if (!isAddress(to)) { setMsg("Enter a valid recipient address."); return; }
    const n = parseFloat(amt);
    if (!isFinite(n) || n <= 0) { setMsg("Enter an amount."); return; }
    setBusy(true);
    try {
      await ensureChain();
      const wc = requireWalletClient();
      const from = getWallet().address as `0x${string}`;
      const a = ASSETS[asset];
      let hash: `0x${string}`;
      if (a.address === null) {
        hash = await wc.sendTransaction({ account: from, to: to as `0x${string}`, value: parseEther(amt), chain: null });
      } else {
        hash = await wc.writeContract({ address: a.address as `0x${string}`, abi: transferAbi, functionName: "transfer", args: [to as `0x${string}`, parseUnits(amt, a.decimals)], account: from, chain: null });
      }
      await publicClient.waitForTransactionReceipt({ hash });
      setMsg(`Sent · ${hash.slice(0, 10)}…`);
      setTo(""); setAmt("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message.slice(0, 120) : "Send failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-back show" id="wModal" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <div className="modal-head"><h3 id="wmTitle">{title}</h3><button className="modal-x" onClick={close}>✕</button></div>
        <div className="modal-body" id="wmBody">
          {!addr ? (
            <p className="pf-empty">Connect a wallet first.</p>
          ) : tab === "receive" ? (
            <div style={{ textAlign: "center" }}>
              {qr && <img src={qr} alt="address QR" style={{ width: 200, height: 200 }} />}
              <div className="mono" style={{ wordBreak: "break-all", margin: "10px 0" }}>{addr}</div>
              <button className="wl-mini" onClick={() => navigator.clipboard.writeText(addr)}>Copy address</button>
            </div>
          ) : tab === "send" ? (
            <>
              <label className="ord-lab">Asset</label>
              <select className="ct-select" value={asset} onChange={(e) => setAsset(Number(e.target.value))}>
                {ASSETS.map((a, i) => <option key={a.sym} value={i}>{a.sym}</option>)}
              </select>
              <label className="ord-lab">Recipient</label>
              <div className="ord-in"><input placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <label className="ord-lab">Amount</label>
              <div className="ord-in"><input placeholder="0.0" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /><span className="ord-unit">{ASSETS[asset].sym}</span></div>
              {msg && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{msg}</div>}
              <button className="ord-submit buy" disabled={busy} onClick={send} style={{ marginTop: 10 }}>{busy ? "Sending…" : "Send"}</button>
            </>
          ) : (
            <p className="pf-empty">Swapping stock tokens here is coming soon. For now, buy or sell on a token page.</p>
          )}
        </div>
        <div className="modal-foot" id="wmFoot"><span className="mono" style={{ color: "var(--muted)" }}>{addr ? shortAddr(addr) : ""}</span></div>
      </div>
    </div>
  );
}
