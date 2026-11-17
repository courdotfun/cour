"use client";
import { useEffect, useState } from "react";
import { shortAddr } from "@/lib/ui/format";
import { siweSignIn } from "@/lib/auth-client";

type Portfolio = { totalValueUsd: number; positions: { token: string; name: string | null; symbol: string | null; balanceWhole: number; valueUsd: number | null }[] };

export function UserView({ address }: { address: string }) {
  const [profile, setProfile] = useState<{ name: string | null; bio: string | null } | null>(null);
  const [follow, setFollow] = useState({ followers: 0, following: 0, isFollowing: false });
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [busy, setBusy] = useState(false);
  const lc = address.toLowerCase();

  useEffect(() => {
    fetch(`/api/profile?address=${lc}`).then((r) => r.json()).then((j) => setProfile(j.profile));
    fetch(`/api/follow?address=${lc}`).then((r) => r.json()).then(setFollow);
    fetch(`/api/ix/portfolio/${lc}`).then((r) => r.json()).then(setPf).catch(() => {});
  }, [lc]);

  async function toggleFollow() {
    setBusy(true);
    try {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      if (!me.address) await siweSignIn();
      const action = follow.isFollowing ? "unfollow" : "follow";
      const r = await fetch("/api/follow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: lc, action }) });
      if (r.ok) { const f = await fetch(`/api/follow?address=${lc}`).then((x) => x.json()); setFollow(f); }
    } finally { setBusy(false); }
  }

  const name = profile?.name || shortAddr(address);
  const positions = pf?.positions ?? [];
  return (
    <section className="view active" id="profile">
      <div id="wlFull">
        <div className="pf-top">
          <div className="pf-id">
            <div className="pf-ava">{(profile?.name || address.slice(2, 4)).slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="pf-name">{name}</div>
              <div className="pf-addr"><span>{shortAddr(address)}</span> <button className="pf-edit" disabled={busy} onClick={toggleFollow}>{follow.isFollowing ? "Unfollow" : "Follow"}</button></div>
              <div className="pf-fl"><span><b>{follow.followers}</b> followers</span><span><b>{follow.following}</b> following</span></div>
              <div className="pf-bio">{profile?.bio || "No bio yet"}</div>
            </div>
          </div>
        </div>
        <div className="wl-grid">
          <div className="wl-main">
            <div className="wl-card">
              <div className="wl-tabs"><button className="wl-tab on">Holdings</button></div>
              <div id="wlList">
                {positions.length === 0 ? <div className="pf-empty">No holdings yet.</div> :
                  positions.map((p) => (
                    <a key={p.token} className="pf-row" href={`/token/${p.token}`}>
                      <div><div className="pf-rname">{p.name ?? shortAddr(p.token)}</div><div className="pf-rtick">{p.balanceWhole.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${p.symbol}</div></div>
                      <div className="pf-rval"><div className="v">{p.valueUsd != null ? `$${p.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</div></div>
                    </a>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
