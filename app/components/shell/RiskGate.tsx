"use client";
import { useEffect, useState } from "react";

const KEY = "cour-risk-ok-v1";
const DRAFT = <span className="lg-draft">Draft, pending legal review</span>;

const RISK = (
  <>
    <p><b>Read this before you use COUR.</b></p>
    <ul>
      <li><b>Not financial advice.</b> Nothing on COUR is investment, legal or tax advice.</li>
      <li><b>You can lose everything.</b> Community tokens can drop to zero. Prices move fast and liquidity can disappear.</li>
      <li><b>Stock tokens are not shares.</b> They are tokenized debt securities issued by a third party. You get price exposure only: no ownership, no voting rights. Redemption and availability depend on the issuer.</li>
      <li><b>Regional limits.</b> Stock tokens are not available everywhere. You are responsible for using COUR only where it is allowed for you.</li>
      <li><b>Community tokens are not audited by COUR.</b> Anyone can launch one. Check the creator, the contract and the fee before you buy.</li>
      <li><b>Smart contract risk.</b> Contracts can have bugs. On-chain transactions cannot be reversed.</li>
      <li><b>Keep your keys safe.</b> COUR will never ask for your seed phrase or private key.</li>
    </ul>
  </>
);
const DOCS: Record<string, { t: string; body: React.ReactNode }> = {
  risk: { t: "Risk disclosure", body: RISK },
  terms: { t: "Terms of Service", body: <>{DRAFT}<p>COUR is a non-custodial interface: you keep control of your wallet and your assets. By using COUR you confirm that you are of legal age, that you are allowed to use it where you live, and that you accept the risks described in the Risk disclosure.</p><p>The full Terms of Service will be published here after legal review. Questions: courdotfun@gmail.com</p></> },
  privacy: { t: "Privacy Policy", body: <>{DRAFT}<p>COUR does not ask for your name or email to use the interface. Your public wallet address and on-chain activity are visible on the blockchain. Preferences such as theme and profile picture are stored on your device.</p><p>The full Privacy Policy will be published here after legal review. Questions: courdotfun@gmail.com</p></> },
};

export function RiskGate() {
  const [gate, setGate] = useState(false);
  const [doc, setDoc] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(KEY) !== "1") setGate(true); } catch {}
    const onDoc = (e: Event) => setDoc((e as CustomEvent).detail);
    window.addEventListener("cour:lgdoc", onDoc);
    return () => window.removeEventListener("cour:lgdoc", onDoc);
  }, []);

  const accept = () => { try { localStorage.setItem(KEY, "1"); } catch {}; setGate(false); };
  const show = gate || doc;
  if (!show) return null;
  const d = doc ? DOCS[doc] : null;

  return (
    <div className="lg-ov show" id="lgOv" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget && !gate) setDoc(null); }}>
      <div className="lg-box">
        <h3 id="lgT">{gate ? "Welcome to COUR" : d!.t}</h3>
        <div className="lg-body" id="lgB">{gate ? RISK : d!.body}</div>
        <div className="lg-foot" id="lgF">
          {gate ? (
            <>
              <label className="lg-chk"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I understand the risks, I am of legal age, and I will only use COUR where it is allowed for me.</span></label>
              <button className="lg-btn" disabled={!agree} onClick={accept}>Continue</button>
            </>
          ) : (
            <button className="lg-btn ghost" onClick={() => setDoc(null)}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function LegalLinks() {
  const open = (k: string) => window.dispatchEvent(new CustomEvent("cour:lgdoc", { detail: k }));
  return (
    <div className="legal-links">
      <a onClick={() => open("terms")}>Terms of Service</a>
      <a onClick={() => open("privacy")}>Privacy Policy</a>
      <a onClick={() => open("risk")}>Risk disclosure</a>
      <span>courdotfun@gmail.com</span>
      <span>@courdotfun</span>
      <span className="lg-sep" />
      <span>COUR is not financial advice. Stock tokens are not shares.</span>
    </div>
  );
}
