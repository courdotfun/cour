import { formatUnits, type Abi, type Address, type Log } from 'viem';
import { factoryAbi, feeVaultAbi, hookAbi, routerAbi } from '../abi/index.js';
import { publicClient } from './chain.js';
import { config, deployment } from './config.js';
import { logger, type Severity } from './logger.js';
import { sendAlert } from './telegram.js';

type AnyLog = Log & { eventName?: string; args?: Record<string, unknown> };

interface WatchCtx {
  nvdaDecimals: number;
}

function fmtStock(raw: unknown, decimals: number): string {
  try {
    return formatUnits(BigInt(raw as bigint), decimals);
  } catch {
    return String(raw);
  }
}

// Map a decoded log to an alert. Returns null to skip (e.g. small FeeTaken).
function toAlert(log: AnyLog, ctx: WatchCtx): { severity: Severity; title: string; data: Record<string, unknown> } | null {
  const name = log.eventName ?? 'UnknownEvent';
  const args = (log.args ?? {}) as Record<string, unknown>;
  const base = { tx: log.transactionHash ?? undefined, block: log.blockNumber?.toString() };

  switch (name) {
    case 'TokenLaunched':
      return {
        severity: 'info',
        title: 'New token launched',
        data: { token: args.token, creator: args.creator, stock: args.stock, metadataURI: args.metadataURI, ...base },
      };
    case 'Graduated':
      return {
        severity: 'info',
        title: 'Token graduated to v4 pool',
        data: { token: args.token, poolId: args.poolId, ...base },
      };
    case 'BuybackExecuted':
      return {
        severity: 'info',
        title: 'Buyback executed',
        data: { token: args.token, stockIn: fmtStock(args.stockIn, ctx.nvdaDecimals), tokensOut: String(args.tokensOut), burned: args.burned, ...base },
      };
    case 'PlatformClaimed':
      return {
        severity: 'info',
        title: 'Platform fees claimed',
        data: { stock: args.stock, treasury: args.treasury, amount: fmtStock(args.amount, ctx.nvdaDecimals), ...base },
      };
    case 'FeeTaken': {
      const fee = Number(fmtStock(args.stockFee, ctx.nvdaDecimals));
      if (!Number.isFinite(fee) || fee < config.largeFeeStock) return null; // only flag large/anomalous
      return {
        severity: 'warn',
        title: 'Large FeeTaken',
        data: { token: args.token, payer: args.payer, stockFee: fee, threshold: config.largeFeeStock, ...base },
      };
    }
    case 'LaunchParamsSet':
      return {
        severity: 'warn',
        title: 'Admin: launch params changed',
        data: {
          startMcUsd: String(args.startMcUsd),
          gradMcUsd: String(args.gradMcUsd),
          minRefLiqUsd: String(args.minRefLiqUsd),
          launchFee: String(args.launchFee),
          ...base,
        },
      };
    case 'LaunchesPausedSet':
      return {
        severity: args.paused ? 'critical' : 'warn',
        title: `Admin: launches ${args.paused ? 'PAUSED' : 'UNPAUSED'}`,
        data: { paused: args.paused, ...base },
      };
    case 'LaunchAllowlistEnabledSet':
      return {
        severity: 'warn',
        title: `Admin: launch allowlist ${args.enabled ? 'ENABLED' : 'DISABLED'}`,
        data: { enabled: args.enabled, ...base },
      };
    case 'LaunchAllowlistSet':
      return {
        severity: 'info',
        title: 'Admin: launch allowlist entry changed',
        data: { account: args.account, allowed: args.allowed, ...base },
      };
    case 'StockSet':
      return {
        severity: 'warn',
        title: 'Admin: stock config changed',
        data: { stock: args.stock, allowed: args.allowed, refPool: args.refPool, refKind: args.refKind, ...base },
      };
    case 'TreasurySet':
      return {
        severity: 'warn',
        title: 'Admin: treasury changed',
        data: { treasury: args.treasury, ...base },
      };
    case 'EthInPathSet':
      return {
        severity: 'warn',
        title: 'Admin: ETH-in swap path changed',
        data: { stock: args.stock, ...base },
      };
    case 'OwnershipTransferred':
      return {
        severity: 'critical',
        title: 'OWNERSHIP TRANSFERRED on a core contract',
        data: { contract: log.address, previousOwner: args.previousOwner, newOwner: args.newOwner, ...base },
      };
    default:
      return null;
  }
}

function watch(label: string, address: Address, abi: Abi, ctx: WatchCtx): () => void {
  const client = publicClient();
  const events = abi.filter((x) => x.type === 'event');
  logger.info(`Watching ${label}`, { address, events: events.length });
  return client.watchEvent({
    address,
    events: events as never,
    onLogs: (logs) => {
      for (const raw of logs as AnyLog[]) {
        const a = toAlert(raw, ctx);
        if (!a) continue;
        // Dedupe on tx+event so the same log (re-seen across poll overlaps) only alerts once.
        const dedupeKey = `${a.title}:${raw.transactionHash}:${raw.logIndex}`;
        void sendAlert({ severity: a.severity, title: a.title, data: a.data, dedupeKey });
      }
    },
    onError: (err) => logger.warn(`watchEvent error (${label})`, { error: err.message }),
  });
}

/** Start every event watcher. Returns a function that stops them all. */
export function startWatchers(ctx: WatchCtx): () => void {
  const unwatchers = [
    watch('COURFactory', deployment.factory, factoryAbi as unknown as Abi, ctx),
    watch('COURFeeVault', deployment.feeVault, feeVaultAbi as unknown as Abi, ctx),
    watch('COURRouter', deployment.router, routerAbi as unknown as Abi, ctx),
    watch('COURHook', deployment.hook, hookAbi as unknown as Abi, ctx),
  ];
  return () => {
    for (const u of unwatchers) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
  };
}
