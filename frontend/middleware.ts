// Vercel Edge Middleware: geo-block disallowed regions (at least the US) and
// show a ToS / disclaimer page. Runs on every request at the edge.
//
// NOTE: The blocked-region list (src/config/regions.ts) is a LEGAL decision and
// must be confirmed by a human (legal/compliance) before production use.
// NOTE: the `.js` extension is REQUIRED. Vercel transpiles this middleware
// per-file and runs it under the Node ESM runtime, where extensionless
// relative imports fail (ERR_MODULE_NOT_FOUND). `bundler` moduleResolution +
// allowImportingTsExtensions let tsc accept the `.js` specifier for a .ts file.
import { BLOCKED_COUNTRIES, ALLOW_PATHS } from "./src/config/regions.js";

// Vercel Edge Middleware runs this on the Edge runtime. Returning `undefined`
// lets the request continue; returning a Response short-circuits it.
export const config = {
  // Run on all paths except Vite static assets.
  matcher: ["/((?!_next|assets|.*\\.(?:js|css|png|jpg|jpeg|svg|ico|woff2?)$).*)"],
};

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (ALLOW_PATHS.some((p) => url.pathname.startsWith(p))) {
    return undefined;
  }

  // Vercel sets x-vercel-ip-country; `request.geo` is also available in Edge.
  const country =
    request.headers.get("x-vercel-ip-country") ??
    (request as any).geo?.country ??
    null;

  if (country && BLOCKED_COUNTRIES.includes(country.toUpperCase())) {
    return new Response(BLOCKED_HTML, {
      status: 451, // Unavailable For Legal Reasons
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return undefined;
}

const BLOCKED_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>COUR — Not available in your region</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060907;color:#e8f0ea;
   font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
 .card{max-width:520px;padding:40px 32px;text-align:center}
 h1{font-size:22px;margin:0 0 12px}
 p{color:#9fb0a6;margin:0 0 16px}
 a{color:#9ee37d}
</style></head><body><div class="card">
 <h1>COUR is not available in your region</h1>
 <p>Based on your location, access to this application is restricted for legal and
 regulatory reasons. Nothing here is an offer, solicitation, or financial advice.</p>
 <p>Tokenized stocks and community tokens carry significant risk, including total
 loss. Stock tokens are not shares and confer no ownership or voting rights.</p>
 <p>If you believe this is an error, please consult the Terms of Service.</p>
</div></body></html>`;
