import Link from "next/link";

export const metadata = { title: "Oink Collection — COUR" };

// §4: on-chain Oink collection doesn't exist yet — Coming soon.
export default function CollectionPage() {
  return (
    <section className="view active" id="collection">
      <div className="panel">
        <Link className="panel-close" href="/" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </Link>
        <h2>Oink Collection</h2>
        <p className="sub">Collect Oink skins, show off your rarity, and unlock more as you trade.</p>
        <div className="ct-done" style={{ display: "block", textAlign: "center", padding: "32px 0" }}>
          <h3>Coming soon</h3>
          <p className="sub">The Oink Collection isn’t live yet. Skins will unlock by trading, joining events and collecting once the on-chain collection ships.</p>
        </div>
      </div>
    </section>
  );
}
