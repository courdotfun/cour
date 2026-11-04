import { stockProbeAbi } from '../abi/index.js';
import { publicClient } from './chain.js';
import { assertRpc, config, deployment } from './config.js';
import { startHealthLoop } from './health.js';
import { logger } from './logger.js';
import { startServer } from './server.js';
import { sendAlert } from './telegram.js';
import { startWatchers } from './watchers.js';

async function nvdaDecimals(): Promise<number> {
  try {
    const d = (await publicClient().readContract({
      address: deployment.nvda,
      abi: stockProbeAbi,
      functionName: 'decimals',
    })) as number;
    return Number(d);
  } catch {
    return 18;
  }
}

async function main(): Promise<void> {
  assertRpc(); // throws clearly if MONITOR_RPC_URL is missing — never prints it

  logger.info('COUR monitor starting', {
    network: deployment.network,
    chainId: deployment.chainId,
    factory: deployment.factory,
    telegram: Boolean(config.telegramBotToken && config.telegramChatId) ? 'enabled' : 'console-only',
    httpPort: config.httpPort,
  });

  // Fail fast if RPC / chain id is wrong.
  const chainId = await publicClient().getChainId();
  if (chainId !== deployment.chainId) {
    throw new Error(`RPC chainId ${chainId} != deployment chainId ${deployment.chainId}`);
  }

  const decimals = await nvdaDecimals();
  logger.info('Connected to chain', { chainId, nvdaDecimals: decimals });

  const server = startServer();
  const stopHealth = await startHealthLoop(); // runs once immediately -> prints first health line
  const stopWatchers = startWatchers({ nvdaDecimals: decimals });

  await sendAlert({
    severity: 'info',
    title: 'COUR monitor online',
    dedupeKey: `startup-${Date.now()}`,
    data: { network: deployment.network, chainId, httpPort: config.httpPort },
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);
    try {
      stopWatchers();
      stopHealth();
    } finally {
      server.close(() => {
        logger.info('HTTP server closed. Bye.');
        process.exit(0);
      });
      // Hard cap in case sockets keep the server open.
      setTimeout(() => process.exit(0), 3_000).unref();
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.warn('unhandledRejection', { reason: String(reason).slice(0, 200) });
  });
}

main().catch((err) => {
  logger.critical('Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
