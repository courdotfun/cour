// Rule engine: match normalized events against subscriber rules, dedupe by event
// id, and render messages. Pure — the only side effect (sending) is injected.
import type { NotifEvent, NotifKind } from "./events.ts";

export interface Rule {
  id: string;
  kind: NotifKind;
  minUsd?: number; // for large_trade
  creators?: string[]; // lowercase addresses to watch (launch)
  tokens?: string[]; // lowercase token addresses to watch
  channel: "telegram" | "webpush";
  target: string; // chat id / push subscription id
}

export interface Notification {
  eventId: string;
  rule: Rule;
  message: string;
}

export function matches(event: NotifEvent, rule: Rule): boolean {
  if (event.kind !== rule.kind) return false;
  if (rule.tokens && rule.tokens.length && !rule.tokens.includes(event.token.toLowerCase())) return false;
  if (rule.kind === "launch" && rule.creators && rule.creators.length) {
    if (!event.creator || !rule.creators.includes(event.creator.toLowerCase())) return false;
  }
  if (rule.kind === "large_trade") {
    const floor = rule.minUsd ?? 0;
    if (event.usd == null || event.usd < floor) return false;
  }
  return true;
}

export function render(event: NotifEvent): string {
  const usd = event.usd != null ? `$${event.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "";
  switch (event.kind) {
    case "launch":
      return `🚀 New launch: $${event.symbol}`;
    case "graduation":
      return `🎓 $${event.symbol} graduated — pool seeded, LP burned forever`;
    case "large_trade":
      return `${event.side === "sell" ? "🔴" : "🟢"} Large ${event.side ?? "trade"} on $${event.symbol}${usd ? ` (${usd})` : ""}`;
  }
}

export interface RunResult {
  notifications: Notification[];
  seen: Set<string>;
}

// Produce notifications for (event, rule) pairs not already seen. The seen key is
// `${eventId}|${rule.id}` so the same event can notify multiple distinct rules
// exactly once each. Returns a NEW seen set (immutable-friendly).
export function runRules(events: NotifEvent[], rules: Rule[], seen: Set<string>): RunResult {
  const next = new Set(seen);
  const notifications: Notification[] = [];
  for (const event of events) {
    const message = render(event);
    for (const rule of rules) {
      if (!matches(event, rule)) continue;
      const key = `${event.id}|${rule.id}`;
      if (next.has(key)) continue;
      next.add(key);
      notifications.push({ eventId: event.id, rule, message });
    }
  }
  return { notifications, seen: next };
}
