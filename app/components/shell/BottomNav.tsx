"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// Port of the v8 .navbar + #addMenu. §4: the "Provide liquidity / earn swap fees"
// item becomes informational (Pools = graduated pools, LP burned).
export function BottomNav() {
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const go = (href: string) => { setMenu(false); router.push(href); };

  return (
    <>
      <nav className="navbar">
        <Link className={`nav-item${path === "/" ? " on" : ""}`} href="/" aria-label="Home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
        </Link>
        <button className="nav-plus" aria-label="Create" onClick={() => setMenu((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <Link className={`nav-item${path.startsWith("/profile") ? " on" : ""}`} href="/profile" aria-label="Profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
        </Link>
      </nav>

      <div className={`add-menu${menu ? " show" : ""}`} id="addMenu">
        <button onClick={() => go("/create")}>
          <span className="am-ic am-launch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M15 9h.01" /></svg></span>
          <span className="am-txt"><b>Launch a token</b><small>Deploy a new stock token</small></span>
          <span className="am-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></span>
        </button>
        <button onClick={() => go("/pools")}>
          <span className="am-ic am-lp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 4.24 7 2c-.29 2.24-1.14 4.13-2.29 5.06S3 11.09 3 12.25c0 2.22 1.8 4.05 4 4.05z" /><path d="M12.56 6.6A11 11 0 0 0 14 3c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a7 7 0 0 1-11.9 4.97" /></svg></span>
          <span className="am-txt"><b>View pools</b><small>Graduated pools · LP burned</small></span>
          <span className="am-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></span>
        </button>
        <button onClick={() => { setMenu(false); window.dispatchEvent(new CustomEvent("cour:scan")); }}>
          <span className="am-ic am-scan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></svg></span>
          <span className="am-txt"><b>Scan QR</b><small>Send to an address or open a token</small></span>
          <span className="am-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></span>
        </button>
      </div>
    </>
  );
}
