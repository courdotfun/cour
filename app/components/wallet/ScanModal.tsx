"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";

// Port of the v8 Scan QR modal. Uses the native BarcodeDetector for camera + image.
// Parses a wallet address or a /token/<addr> link and navigates.
export function ScanModal() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("Point the camera at a wallet address or token QR code.");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const router = useRouter();

  useEffect(() => {
    const onScan = () => setOpen(true);
    window.addEventListener("cour:scan", onScan);
    return () => window.removeEventListener("cour:scan", onScan);
  }, []);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const Det = (window as any).BarcodeDetector;
    const detector = Det ? new Det({ formats: ["qr_code"] }) : null;
    (async () => {
      if (!detector) { setMsg("QR scanning isn’t supported on this browser — upload an image instead."); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const tick = async () => {
          try {
            if (videoRef.current && videoRef.current.readyState === 4) {
              const codes = await detector.detect(videoRef.current);
              if (codes[0]) return handle(codes[0].rawValue);
            }
          } catch {}
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch { setMsg("Camera unavailable — upload an image instead."); }
    })();
    return () => { cancelAnimationFrame(raf); streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [open]);

  function handle(text: string) {
    const tokenMatch = text.match(/\/token\/(0x[0-9a-fA-F]{40})/);
    const addrMatch = text.match(/0x[0-9a-fA-F]{40}/);
    close();
    if (tokenMatch) router.push(`/token/${tokenMatch[1]}`);
    else if (addrMatch && isAddress(addrMatch[0])) router.push(`/u/${addrMatch[0]}`);
    else setMsg("No wallet address or token found in that code.");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const Det = (window as any).BarcodeDetector;
    if (!Det) { setMsg("QR decoding isn’t supported on this browser."); return; }
    try {
      const bmp = await createImageBitmap(f);
      const codes = await new Det({ formats: ["qr_code"] }).detect(bmp);
      if (codes[0]) handle(codes[0].rawValue);
      else setMsg("No QR code found in that image.");
    } catch { setMsg("Could not read that image."); }
  }

  function close() { streamRef.current?.getTracks().forEach((t) => t.stop()); setOpen(false); }
  if (!open) return null;

  return (
    <div className="modal-back show" id="scanModal" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <div className="modal-head"><h3>Scan QR</h3><button className="modal-x" onClick={close}>✕</button></div>
        <div className="modal-body">
          <div className="sc-view" id="scView"><video ref={videoRef} id="scVideo" playsInline muted /><div className="sc-frame" /></div>
          <div className="sc-msg" id="scMsg">{msg}</div>
          <div className="sc-alt">
            <label className="wl-ghost sc-altb">Upload image<input type="file" accept="image/*" hidden onChange={onFile} /></label>
          </div>
        </div>
      </div>
    </div>
  );
}
