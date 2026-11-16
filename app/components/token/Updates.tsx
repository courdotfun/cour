"use client";
import { useEffect, useState } from "react";
import { siweSignIn, currentSession } from "@/lib/auth-client";

type Update = { id: number; title: string | null; body: string; createdAt: string };

export function Updates({ token, creator }: { token: string; creator: string }) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [session, setSession] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isCreator = !!session && session.toLowerCase() === creator.toLowerCase();

  async function load() {
    const r = await fetch(`/api/token/${token}/updates`);
    const j = await r.json();
    setUpdates(j.updates ?? []);
  }
  useEffect(() => {
    load();
    currentSession().then(setSession);
  }, [token]);

  async function post() {
    setErr(null);
    if (!body.trim()) return;
    setBusy(true);
    try {
      let who = session;
      if (!who) who = await siweSignIn().then((a) => (setSession(a), a));
      const r = await fetch(`/api/token/${token}/updates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title || undefined, body }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error === "not_creator" ? "Only the token creator can post." : j.error === "db_unavailable" ? "Updates store not configured yet." : "Failed to post.");
      }
      setTitle("");
      setBody("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tk-card" id="tkUpdCard">
      <h3 className="tk-h3">Updates</h3>
      <div id="tkUpd">
        {isCreator && (
          <div className="tk-upd-compose">
            <input className="tk-upd-title" placeholder="Title (optional)" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="tk-upd-body" placeholder="Share an update with your holders…" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
            {err && <div className="tk-upd-err">{err}</div>}
            <button className="wl-mini lime" disabled={busy || !body.trim()} onClick={post}>{busy ? "Posting…" : "Post update"}</button>
          </div>
        )}
        {updates.length === 0 ? (
          <div className="tk-empty">No updates yet.</div>
        ) : (
          updates.map((u) => (
            <div key={u.id} className="tk-upd-item">
              {u.title && <div className="tk-upd-h">{u.title}</div>}
              <div className="tk-upd-b">{u.body}</div>
              <div className="tk-upd-t">{new Date(u.createdAt).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
