"use client";
import { useState } from "react";
import { siweSignIn } from "@/lib/auth-client";

type Profile = { name: string | null; bio: string | null; avatarCid: string | null };

export function EditProfileModal({ addr, profile, onClose, onSaved }: {
  addr: string;
  profile: Profile | null;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      if (!me.address || me.address.toLowerCase() !== addr.toLowerCase()) await siweSignIn();
      const r = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name || undefined, bio: bio || undefined }),
      });
      if (!r.ok) throw new Error("Save failed");
      const j = await r.json();
      onSaved(j.profile);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back show" id="editModal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head"><h3>Edit profile</h3><button className="modal-x" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="ef-ava-row"><div className="pf-ava pf-lockava" id="efAva">{(name || addr.slice(2, 4)).slice(0, 2).toUpperCase()}</div><div className="ef-skin-t"><b>Oink skins</b><span>Not unlocked yet</span></div></div>
          <p className="ef-skin-n">The Oink Collection is coming soon. Unlock Oink skins by trading, joining events and collecting.</p>
          <label>Display name</label>
          <input maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your wallet address" />
          <label>Bio</label>
          <textarea maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about yourself" />
          {err && <div className="ef-err" style={{ color: "#ff6b6b" }}>{err}</div>}
          <button className="launch" disabled={busy} onClick={save}>{busy ? "Signing…" : "Save (sign in with wallet)"}</button>
        </div>
      </div>
    </div>
  );
}
