// Notifier service: polls the Phase-1 indexer, derives events, runs subscriber
// rules, and delivers via Telegram / web push. Idempotent across restarts via an
// injectable state store (default: a JSON file).
import { IndexerClient } from "../shared/indexer-client.ts";
import type { Hex, TokenRow } from "../shared/types.ts";
import { tokenEvents, tradeEvents, advanceCursors, type Cursors, type NotifEvent } from "./events.ts";
import { runRules, type Rule } from "./rules.ts";
import { deliver, telegramTransport, webPushTransport, type Transport } from "./channels.ts";
import { readFile, writeFile } from "node:fs/promises";

export interface State {
  seen: string[];
  cursors: Cursors;
}

export interface Store {
  load(): Promise<State>;
  save(s: State): Promise<void>;
}

export function fileStore(path: string): Store {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, "utf8")) as State;
      } catch {
        return { seen: [], cursors: { lastLaunchTs: 0, lastGraduationTs: 0 } };
      }
    },
    async save(s) {
      // keep the seen set bounded
      const seen = s.seen.slice(-5000);
      await writeFile(path, JSON.stringify({ ...s, seen }, null, 2));
    },
  };
}

export interface TickDeps {
  client: Pick<IndexerClient, "tokens" | "trades">;
  rules: Rule[];
  channels: Record<string, Transport>;
  store: Store;
  largeTradeFloorUsd?: number;
}

// One poll cycle. Exposed (and pure of timers) so it is unit-testable.
export async function tick(deps: TickDeps): Promise<{ delivered: number }> {
  const state = await deps.store.load();
  const seen = new Set(state.seen);

  const { tokens } = await deps.client.tokens("new", 100);
  const symbolOf = (addr: Hex) => {
    const t = tokens.find((x: TokenRow) => x.address.toLowerCase() === addr.toLowerCase());
    return (t?.symbol || "TOKEN").toUpperCase();
  };
  const { trades } = await deps.client.trades(null, 100);

  const events: NotifEvent[] = [...tokenEvents(tokens, state.cursors), ...tradeEvents(trades, symbolOf)];

  const { notifications, seen: nextSeen } = runRules(events, deps.rules, seen);
  const results = await deliver(notifications, deps.channels);
  const okIds = new Set(results.filter((r) => r.ok).map((r) => `${r.eventId}|${r.ruleId}`));

  // Only persist "seen" for notifications that actually delivered, so a transient
  // send failure retries next tick.
  const persistSeen = [...seen];
  for (const key of nextSeen) if (!seen.has(key) && okIds.has(key)) persistSeen.push(key);

  // Advance cursors ONLY past events whose deliveries all succeeded (or that
  // matched no rule). An event with any failed send stays "live" so the next
  // tick re-derives and retries it instead of silently dropping it.
  const failedEventIds = new Set(results.filter((r) => !r.ok).map((r) => r.eventId));
  const resolvedEvents = events.filter((e) => !failedEventIds.has(e.id));
  const cursors = advanceCursors(state.cursors, resolvedEvents);
  await deps.store.save({ seen: persistSeen, cursors });
  return { delivered: results.filter((r) => r.ok).length };
}

// Entry point for `node notifier/index.ts` (prod wiring from env).
async function main() {
  const base = process.env.INDEXER_URL;
  if (!base) throw new Error("INDEXER_URL is required");
  const client = new IndexerClient({ baseUrl: base });
  const channels: Record<string, Transport> = {};
  if (process.env.TELEGRAM_BOT_TOKEN) channels.telegram = telegramTransport(process.env.TELEGRAM_BOT_TOKEN);
  if (process.env.WEBPUSH_ENABLED) channels.webpush = webPushTransport(async () => {});
  const rules: Rule[] = JSON.parse(process.env.RULES_JSON || "[]");
  const store = fileStore(process.env.STATE_FILE || "./notifier-state.json");
  const intervalMs = Number(process.env.POLL_MS || 15000);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { delivered } = await tick({ client, rules, channels, store });
      if (delivered) console.log(`[notifier] delivered ${delivered}`);
    } catch (e: any) {
      console.warn("[notifier] tick failed:", e?.message);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("index.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
