// Tiny structured console logger. Never logs secrets (RPC URL / tokens).

export type Severity = 'info' | 'warn' | 'critical';

const ICON: Record<Severity, string> = {
  info: 'INFO',
  warn: 'WARN',
  critical: 'CRIT',
};

function ts(): string {
  return new Date().toISOString();
}

export function log(severity: Severity, message: string, data?: Record<string, unknown>): void {
  const base = `[${ts()}] [${ICON[severity]}] ${message}`;
  if (data && Object.keys(data).length > 0) {
    // eslint-disable-next-line no-console
    console.log(base, JSON.stringify(data));
  } else {
    // eslint-disable-next-line no-console
    console.log(base);
  }
}

export const logger = {
  info: (m: string, d?: Record<string, unknown>) => log('info', m, d),
  warn: (m: string, d?: Record<string, unknown>) => log('warn', m, d),
  critical: (m: string, d?: Record<string, unknown>) => log('critical', m, d),
};
