import { config } from './config.js';
import { logger, type Severity } from './logger.js';

export interface Alert {
  severity: Severity;
  title: string;
  body?: string;
  // Stable key used for de-duplication. Defaults to `${severity}:${title}`.
  dedupeKey?: string;
  data?: Record<string, unknown>;
}

const lastSent = new Map<string, number>();
let delivered = 0;
let suppressed = 0;

const SEV_EMOJI: Record<Severity, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  critical: '🚨',
};

function formatText(a: Alert): string {
  const lines = [`${SEV_EMOJI[a.severity]} *COUR ${a.severity.toUpperCase()}* — ${a.title}`];
  if (a.body) lines.push(a.body);
  if (a.data && Object.keys(a.data).length > 0) {
    for (const [k, v] of Object.entries(a.data)) lines.push(`• ${k}: ${String(v)}`);
  }
  return lines.join('\n');
}

async function sendTelegram(text: string): Promise<void> {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;
  if (!token || !chatId) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Do not surface the token; only the API response body.
    logger.warn('Telegram delivery failed', { status: res.status, detail: detail.slice(0, 200) });
  }
}

/** Fire an alert. De-duplicated per `dedupeKey` within config.alertDedupeMs. */
export async function sendAlert(a: Alert): Promise<void> {
  const key = a.dedupeKey ?? `${a.severity}:${a.title}`;
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev !== undefined && now - prev < config.alertDedupeMs) {
    suppressed += 1;
    return;
  }
  lastSent.set(key, now);
  delivered += 1;

  // Always log to console (formatted), regardless of Telegram config.
  logger[a.severity](`ALERT: ${a.title}`, { ...(a.body ? { body: a.body } : {}), ...a.data });

  if (config.telegramBotToken && config.telegramChatId) {
    try {
      await sendTelegram(formatText(a));
    } catch (err) {
      logger.warn('Telegram send threw', { error: (err as Error).message });
    }
  }
}

export function alertStats(): { delivered: number; suppressed: number; telegramEnabled: boolean } {
  return {
    delivered,
    suppressed,
    telegramEnabled: Boolean(config.telegramBotToken && config.telegramChatId),
  };
}
