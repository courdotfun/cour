// Geo-block region configuration.
//
// IMPORTANT: The final blocked-region list is a LEGAL decision and must be
// reviewed and signed off by a human (legal/compliance). The list below is a
// conservative placeholder that blocks at least the United States, per the
// product brief. Edit BLOCKED_COUNTRIES after legal review.
//
// Country codes are ISO 3166-1 alpha-2 (as provided by Vercel's geo header).
export const BLOCKED_COUNTRIES: string[] = [
  "US", // United States — placeholder; confirm with legal.
  // Common additions sanctioned/high-risk jurisdictions (review before enabling):
  // "CU", "IR", "KP", "SY", "RU",
];

// Paths that must remain reachable even from blocked regions (e.g. the
// disclaimer page itself, static assets).
export const ALLOW_PATHS: string[] = ["/blocked", "/tos", "/favicon.ico"];

export function isBlocked(country: string | null | undefined): boolean {
  if (!country) return false; // unknown geo -> do not hard-block (fail open; legal choice)
  return BLOCKED_COUNTRIES.includes(country.toUpperCase());
}
