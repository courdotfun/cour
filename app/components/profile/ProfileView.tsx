"use client";
import { useEffect, useState } from "react";
import { connect, getWallet, disconnect } from "@/lib/chain/wallet";
import { nativeBalance } from "@/lib/data/onchain";
import { fromRaw, shortAddr } from "@/lib/ui/format";
import { siweSignIn, currentSession } from "@/lib/auth-client";
import { EditProfileModal } from "./EditProfileModal";

type Portfolio = {
  totalValueUsd: number;
  positions: { token: string; name: string | null; symbol: string | null; balanceWhole: number; valueUsd: number | null; graduated: boolean }[];
};
type Profile = { name: string | null; bio: string | null; avatarCid: string | null };

export function ProfileView() {
  const [addr, setAddr] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [follow, setFollow] = useState({ followers: 0, following: 0 });
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [eth, setEth] = useState<bigint>(0n);
  const [tab, setTab] = useState("tokens");
  const [edit, setEdit] = useState(false);

  useEffect(() => {
    const a = getWallet().address;
    if (a) load(a);
  }, []);

  async function load(a: string) {
    setAddr(a);
    const lc = a.toLowerCase();
    fetch(`/api/profile?address=${lc}`).then((r) => r.json()).then((j) => setProfile(j.profile));
    fetch(`/api/follow?address=${lc}`).then((r) => r.json()).then(setFollow);
    fetch(`/api/ix/portfolio/${lc}`).then((r) => r.json()).then(setPf).catch(() => {});
    try { setEth(await nativeBalance(a as `0x${string}`)); } catch {}
  }

  async function doConnect() {
    const e = (window as any).ethereum;
    if (!e) { alert("No wallet found."); return; }
    const s = await connect(e);
    if (s.address) load(s.address);
  }

  if (!addr) {
    return (
      <section className="view active" id="profile">
        <div id="wlEmpty" className="wl-empty">
          <div className="wl-empty-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3" /></svg>
          </div>
          <h2>Your stocks, on-chain</h2>
          <p>Connect a wallet to open your profile: tokenized stocks and COUR tokens in one place, tokens you launched, and everything you traded.</p>
          <button className="launch" onClick={doConnect}>Connect wallet</button>
          <div className="wl-pillars">
            <div><b>Hold</b><span>NVDA and more as tokens you control.</span></div>
            <div><b>Launch</b><span>Create a token paired with a stock you hold.</span></div>
            <div><b>Trade</b><span>Buy and sell on bonding curves and graduated pools.</span></div>
          </div>
        </div>
      </section>
    );
  }

  const name = profile?.name || shortAddr(addr);
  const positions = pf?.positions ?? [];
  const total = pf?.totalValueUsd ?? 0;

  return (
    <section className="view active" id="profile">
      <div id="wlFull">
        <div className="pf-top">
          <div className="pf-id">
            <div className="pf-ava">{(profile?.name || addr.slice(2, 4)).slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="pf-name">{name} <span className="pf-conn">Connected</span></div>
              <div className="pf-addr">
                <span id="pfAddrTxt">{shortAddr(addr)}</span>{" "}
                <button className="pf-copy" onClick={() => navigator.clipboard.writeText(addr)}>Copy</button>{" "}
                <button className="pf-edit" onClick={() => setEdit(true)}>Edit profile</button>
              </div>
              <div className="pf-fl" id="pfFl"><span><b>{follow.followers}</b> followers</span><span><b>{follow.following}</b> following</span></div>
              <div className="pf-bio" id="pfBio">{profile?.bio || "No bio yet"}</div>
            </div>
          </div>
          <div className="wl-topr">
            <button className="wl-net" data-netbtn type="button"><i /><span data-net>Robinhood Chain</span> <b className="net-dd">▾</b></button>
            <button className="wl-mini" onClick={() => { disconnect(); setAddr(null); }}>Disconnect</button>
          </div>
        </div>

        <div className="wl-grid">
          <div className="wl-main">
            <div className="wl-hero">
              <div className="wl-top">
                <div className="ok-row"><div className="ok-pig" id="okPig" title="Oink" /><div>
                  <div className="wl-l">Total balance</div>
                  <div className="wl-total" id="wlTotal">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                </div></div>
              </div>
              <div className="wl-actions">
                <button className="wl-act" onClick={() => window.dispatchEvent(new CustomEvent("cour:wallet", { detail: "receive" }))}><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg></span>Receive</button>
                <button className="wl-act" onClick={() => window.dispatchEvent(new CustomEvent("cour:wallet", { detail: "send" }))}><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></span>Send</button>
                <button className="wl-act" onClick={() => window.dispatchEvent(new CustomEvent("cour:wallet", { detail: "swap" }))}><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4" /></svg></span>Swap</button>
                <button className="wl-act" title="Coming soon" style={{ opacity: 0.55 }}><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3s6 6.4 6 10.4a6 6 0 0 1-12 0C6 9.4 12 3 12 3Z" /></svg></span>Earn</button>
              </div>
            </div>

            <div className="wl-card">
              <div className="wl-tabs" id="wlTabs">
                {[["tokens", "COUR tokens"], ["cash", "ETH"], ["created", "Created"], ["orders", "Orders"]].map(([k, l]) => (
                  <button key={k} className={`wl-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>
              <div id="wlList">
                {tab === "tokens" && (positions.length === 0 ? <div className="pf-empty">No holdings yet — buy a token to start your portfolio.</div> :
                  positions.map((p) => (
                    <a key={p.token} className="pf-row" href={`/token/${p.token}`}>
                      <div><div className="pf-rname">{p.name ?? shortAddr(p.token)}</div><div className="pf-rtick">{p.balanceWhole.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${p.symbol}</div></div>
                      <div className="pf-rval"><div className="v">{p.valueUsd != null ? `$${p.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</div></div>
                    </a>
                  )))}
                {tab === "cash" && <div className="pf-row"><div><div className="pf-rname">Ether</div><div className="pf-rtick">{fromRaw(eth, 18).toLocaleString(undefined, { maximumFractionDigits: 5 })} ETH</div></div></div>}
                {tab === "created" && <div className="pf-empty">Tokens you launch appear here.</div>}
                {tab === "orders" && <div className="pf-empty">Limit orders are coming soon.</div>}
              </div>
            </div>
          </div>

          <aside className="wl-side">
            <div className="wl-earn">
              <div className="wl-earn-hd"><h3>Earn</h3></div>
              <div id="wlEarnBody"><div className="pf-empty">Earning on idle shares is coming soon. COUR pools have no LP fee and burned LP.</div></div>
            </div>
            <div className="wl-card">
              <h3>Your keys, your stocks</h3>
              <ul className="wl-sec">
                <li>COUR never holds your assets. Every send and swap is signed by your wallet.</li>
                <li>Stock tokens are issued by licensed partners and track the real share price.</li>
                <li>Tokens trade 24/7; the underlying price updates during market hours.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
      {edit && <EditProfileModal addr={addr} profile={profile} onClose={() => setEdit(false)} onSaved={(p) => { setProfile(p); setEdit(false); }} />}
    </section>
  );
}
