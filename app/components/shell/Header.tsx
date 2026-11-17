"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toggleTheme, nextThemeLabel } from "@/lib/theme";
import { BRAND_WM } from "./brandLogo";

type SearchResults = {
  tokens: { address: string; name?: string | null; symbol?: string | null }[];
  stocks: { symbol: string; address: string }[];
  users: { address: string; name: string | null }[];
};

export function Header() {
  const [themeLbl, setThemeLbl] = useState("Dark");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResults | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => setThemeLbl(nextThemeLabel()), []);

  // ⌘K / Ctrl-K focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // debounced search → /api/search
  useEffect(() => {
    if (q.trim().length < 1) {
      setRes(null);
      return;
    }
    const ac = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ac.signal });
        setRes(await r.json());
      } catch {}
    }, 180);
    return () => {
      clearTimeout(id);
      ac.abort();
    };
  }, [q]);

  async function connect() {
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("No wallet found. Install MetaMask or a compatible wallet.");
      return;
    }
    try {
      const accs: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (accs?.[0]) setAccount(accs[0]);
    } catch {}
  }
  const short = account ? account.slice(0, 6) + "…" + account.slice(-4) : null;

  return (
    <header>
      <div className="brand" role="link" aria-label="COUR home" onClick={() => router.push("/")} dangerouslySetInnerHTML={{ __html: BRAND_WM }} />
      <div className="bar">
        <div className="search-top">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="topSearch"
            ref={searchRef}
            placeholder="Search tokens, stocks, addresses…"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="search-results" id="searchResults" style={{ display: res ? "block" : "none" }}>
            {res?.tokens?.map((t) => (
              <Link key={t.address} className="sr-item" href={`/token/${t.address}`} onClick={() => setQ("")}>
                {(t.name ?? t.symbol ?? t.address)} <span className="sr-sub">${t.symbol}</span>
              </Link>
            ))}
            {res?.users?.map((u) => (
              <Link key={u.address} className="sr-item" href={`/u/${u.address}`} onClick={() => setQ("")}>
                {u.name ?? u.address}
              </Link>
            ))}
            {res && !res.tokens?.length && !res.users?.length && !res.stocks?.length ? (
              <div className="sr-item sr-empty">No results</div>
            ) : null}
          </div>
          <span className="kbd">⌘K</span>
        </div>
        <div className="spacer" />
        <div className="chain" id="netChip" role="button" tabIndex={0} aria-haspopup="menu">
          <svg className="rh" viewBox="0 0 24 24" fill="none" stroke="#21e065" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
            <path d="M16 8 2 22" />
            <path d="M17.5 15H9" />
          </svg>
          <span data-net>Robinhood Chain</span>
          <b className="net-dd">▾</b>
        </div>
        <button className="theme-btn" title="Switch theme" aria-label="Switch theme" onClick={() => { toggleTheme(); setThemeLbl(nextThemeLabel()); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2" />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
          </svg>
          <span id="themeLbl">{themeLbl}</span>
        </button>
        <button className="theme-btn snd-btn off" id="sndBtn" type="button" aria-label="Sound off" title="Sound off" onClick={(e) => e.currentTarget.classList.toggle("off")}>
          <svg className="snd-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18.3 6.5a7.5 7.5 0 0 1 0 11" /></svg>
          <svg className="snd-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></svg>
        </button>
        <button className="btn-connect" onClick={connect}>
          {short ?? "Connect"}
        </button>
      </div>
    </header>
  );
}
