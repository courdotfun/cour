import Link from "next/link";
import { CreateForm } from "@/components/create/CreateForm";

export const metadata = { title: "Launch a token — COUR" };

export default function CreatePage() {
  return (
    <section className="view active" id="create">
      <div className="panel">
        <Link className="panel-close" href="/" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </Link>
        <h2>Launch a token</h2>
        <p className="sub">Deploy in seconds. Bonding curve, liquidity, and trading handled for you.</p>
        <CreateForm />
      </div>
    </section>
  );
}
