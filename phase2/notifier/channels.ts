// Delivery channels. Transport is injected so unit tests never hit the network.
import type { Notification } from "./rules.ts";

export interface Transport {
  // returns a provider message id / status string
  send(target: string, message: string): Promise<string>;
}

// Telegram Bot API transport (sendMessage). Real impl uses fetch.
export function telegramTransport(botToken: string, fetchImpl = globalThis.fetch): Transport {
  return {
    async send(chatId, message) {
      const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      if (!res.ok) throw new Error(`telegram ${res.status}`);
      const j: any = await res.json();
      return String(j.result?.message_id ?? "ok");
    },
  };
}

// Web Push transport. `pushSend` is an injected web-push send function
// (e.g. from the `web-push` package) to keep VAPID keys out of this module.
export function webPushTransport(pushSend: (subscription: string, payload: string) => Promise<void>): Transport {
  return {
    async send(subscription, message) {
      await pushSend(subscription, JSON.stringify({ title: "COUR", body: message }));
      return "sent";
    },
  };
}

export interface DeliveryResult {
  eventId: string;
  ruleId: string;
  ok: boolean;
  info: string;
}

// Deliver notifications through the channel map. Failures are captured per
// notification (one bad send never blocks the rest).
export async function deliver(
  notifications: Notification[],
  channels: Record<string, Transport>,
): Promise<DeliveryResult[]> {
  const out: DeliveryResult[] = [];
  for (const n of notifications) {
    const transport = channels[n.rule.channel];
    if (!transport) {
      out.push({ eventId: n.eventId, ruleId: n.rule.id, ok: false, info: `no transport for ${n.rule.channel}` });
      continue;
    }
    try {
      const info = await transport.send(n.rule.target, n.message);
      out.push({ eventId: n.eventId, ruleId: n.rule.id, ok: true, info });
    } catch (e: any) {
      out.push({ eventId: n.eventId, ruleId: n.rule.id, ok: false, info: e?.message ?? "send failed" });
    }
  }
  return out;
}
