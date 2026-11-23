"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deployment } from "@/lib/chain/deployment";
import { connect, getWallet } from "@/lib/chain/wallet";
import { isLaunchAllowed } from "@/lib/data/onchain";
import { createToken, uploadImageToIpfs, uploadMetadata, randomSalt } from "@/lib/features/launch";
import type { Hex } from "@/lib/data/types";

const MODES = [
  { v: 0, label: "Creator (you get 80%)" },
  { v: 1, label: "Holders" },
  { v: 2, label: "Buyback" },
  { v: 3, label: "Buyback & burn" },
];

export function CreateForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [tick, setTick] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fee, setFee] = useState(1);
  const [mode, setMode] = useState(0);
  const [initialBuy, setInitialBuy] = useState("");
  const [links, setLinks] = useState({ website: "", x: "", telegram: "", discord: "" });
  const [account, setAccount] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [bad, setBad] = useState({ name: false, tick: false, img: false });
  const [phase, setPhase] = useState<number>(-1); // -1 idle, 0..3 steps, 4 done
  const [result, setResult] = useState<{ token: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const a = getWallet().address;
    if (a) { setAccount(a); isLaunchAllowed(a as Hex).then(setAllowed); }
  }, []);

  async function ensureWallet(): Promise<string> {
    const w = getWallet();
    if (w.address) return w.address;
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("No wallet found");
    const s = await connect(eth);
    if (!s.address) throw new Error("Connect failed");
    setAccount(s.address);
    setAllowed(await isLaunchAllowed(s.address as Hex));
    return s.address;
  }

  // Matches v8's #ctNext: the Continue button is always enabled (so it renders at full
  // opacity, like the design) and validates on click — name, ticker and image are
  // required; invalid fields get `.bad` (which reveals their `.err`) and the step does
  // not advance. (The app previously `disabled` the button, which dimmed it to opacity
  // .6 and broke visual parity with v8 at every width.)
  function goNext() {
    const nb = { name: !name.trim(), tick: !tick.trim().replace(/^\$/, ""), img: !file };
    setBad(nb);
    if (nb.name || nb.tick || nb.img) return;
    setStep(2);
  }

  async function launch() {
    setErr(null);
    try {
      const addr = await ensureWallet();
      if (!(await isLaunchAllowed(addr as Hex))) {
        setErr("Launches are invite-only during beta — your address is not allowlisted yet.");
        return;
      }
      setPhase(0);
      let image: string | undefined;
      if (file) image = await uploadImageToIpfs(file);
      const metadataURI = await uploadMetadata({
        name,
        symbol: tick.replace(/^\$/, ""),
        description: desc || undefined,
        image,
        links: Object.fromEntries(Object.entries(links).filter(([, v]) => v)) as Record<string, string>,
      });
      setPhase(1);
      const res = await createToken({
        name,
        symbol: tick.replace(/^\$/, ""),
        metadataURI,
        stock: deployment.nvda as Hex,
        creatorFeeBps: fee * 100,
        creatorMode: mode,
        feeRecipient: addr as Hex,
        initialBuyStock: initialBuy ? BigInt(Math.floor(parseFloat(initialBuy) * 1e18)) : 0n,
        minInitialTokens: 0n,
        salt: randomSalt(),
      });
      setPhase(3);
      setResult({ token: res.token });
      setPhase(4);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Launch failed");
      setPhase(-1);
    }
  }

  if (phase >= 0 && phase < 4) {
    const steps = ["Uploading image to IPFS", "Deploying token contract", "Creating pool and burning liquidity", "Listing on COUR market"];
    return (
      <div className="ct-steps" id="ctSteps">
        {steps.map((s, i) => (
          <div key={i} className={`ct-step${i <= phase ? " on" : ""}`} data-s={i}><b /> {s}</div>
        ))}
      </div>
    );
  }
  if (phase === 4 && result) {
    return (
      <div className="ct-done" id="ctDone" style={{ display: "block" }}>
        <h3 id="ctDoneName">{name} is live</h3>
        <p id="ctDoneSub">${tick.replace(/^\$/, "")} launched on COUR.</p>
        <div className="row">
          <button className="primary" onClick={() => router.push(`/token/${result.token}`)}>View token</button>
          <button onClick={() => { setPhase(-1); setStep(1); setName(""); setTick(""); setDesc(""); setFile(null); setResult(null); }}>Launch another</button>
        </div>
      </div>
    );
  }

  return (
    <div id="ctForm">
      <div className="ct-prog" id="ctProg">
        <span className={`cp${step === 1 ? " on" : ""}`} data-p="1"><b>1</b> Details</span>
        <i className="cp-line" />
        <span className={`cp${step === 2 ? " on" : ""}`} data-p="2"><b>2</b> Launch</span>
      </div>

      {account && allowed === false && (
        <div className="ct-gate" style={{ color: "var(--warn, #ffcf5c)", margin: "8px 0", fontSize: 13 }}>
          Launches are invite-only during beta — your address is not allowlisted yet.
        </div>
      )}

      {step === 1 ? (
        <div className="ct-stepwrap" data-step="1">
          <div className={`field${bad.name ? " bad" : ""}`} id="fName">
            <label>Token name</label>
            <input value={name} onChange={(e) => { setName(e.target.value); if (bad.name) setBad({ ...bad, name: false }); }} placeholder="e.g. Nova Protocol" maxLength={22} />
            <div className="err">Give your token a name.</div>
          </div>
          <div className={`field${bad.tick ? " bad" : ""}`} id="fTick">
            <label>Ticker</label>
            <input value={tick} onChange={(e) => { setTick(e.target.value); if (bad.tick) setBad({ ...bad, tick: false }); }} placeholder="$NOVA" maxLength={8} />
            <div className="err">Ticker is required.</div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is your token about?" maxLength={160} />
            <div className="ct-cnt">{desc.length} / 160</div>
          </div>
          <div className={`field${bad.img ? " bad" : ""}`} id="fImg">
            <label>Token image</label>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { setFile(e.target.files?.[0] ?? null); if (bad.img) setBad({ ...bad, img: false }); }} />
            <div className="drop" onClick={() => fileRef.current?.click()}>
              <div className="ic">⇪</div>
              {file ? file.name : "Drop an image or click to upload"}
              <small>PNG, JPG or GIF — up to 5MB</small>
            </div>
            <div className="err">Upload a token image.</div>
          </div>
          <button className="launch" type="button" onClick={goNext}>Continue →</button>
        </div>
      ) : (
        <div className="ct-stepwrap" data-step="2">
          <div className="field">
            <label>Pair with</label>
            <select className="ct-select" disabled>
              <option>NVDA</option>
            </select>
            <small style={{ color: "var(--muted)" }}>More stocks coming soon — beta launches pair with NVDA.</small>
          </div>
          <div className="field">
            <label>Fee mode</label>
            <select className="ct-select" value={mode} onChange={(e) => setMode(Number(e.target.value))}>
              {MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Initial buy (NVDA, optional)</label>
            <input value={initialBuy} onChange={(e) => setInitialBuy(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </div>
          <div className="field">
            <div className="ct-feehd"><label>Creator fee</label><b>{fee}%</b></div>
            <input type="range" className="ct-range" min={1} max={10} step={1} value={fee} onChange={(e) => setFee(Number(e.target.value))} aria-label="Creator fee percent" />
            <div className="ct-scale"><span>1%</span><span>5%</span><span>10%</span></div>
          </div>
          <div className="field">
            <label>Links <small style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</small></label>
            <div className="two">
              <input placeholder="Website" value={links.website} onChange={(e) => setLinks({ ...links, website: e.target.value })} />
              <input placeholder="X (Twitter)" value={links.x} onChange={(e) => setLinks({ ...links, x: e.target.value })} />
            </div>
            <div className="two" style={{ marginTop: 10 }}>
              <input placeholder="Telegram" value={links.telegram} onChange={(e) => setLinks({ ...links, telegram: e.target.value })} />
              <input placeholder="Discord" value={links.discord} onChange={(e) => setLinks({ ...links, discord: e.target.value })} />
            </div>
          </div>
          {err && <div className="ct-err" style={{ color: "#ff6b6b", margin: "6px 0" }}>{err}</div>}
          <div className="ct-nav2">
            <button type="button" className="ct-back" onClick={() => setStep(1)}>← Back</button>
            <button className="launch" onClick={launch}>Launch token</button>
          </div>
        </div>
      )}
    </div>
  );
}
