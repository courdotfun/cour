import { createServer, type Server } from 'node:http';
import { config, deployment } from './config.js';
import { logger } from './logger.js';
import { snapshot } from './state.js';
import { alertStats } from './telegram.js';

function json(res: import('node:http').ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(payload);
}

/**
 * Read-only status server.
 *  GET /health  -> liveness/readiness (ok if a recent block was seen)
 *  GET /status  -> full observed snapshot (addresses, balances, paused, last price)
 */
export function startServer(): Server {
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];

    if (url === '/health') {
      const ok = snapshot.lastBlock !== null && snapshot.lastError === null;
      json(res, ok ? 200 : 503, {
        ok,
        lastBlock: snapshot.lastBlock,
        lastBlockAt: snapshot.lastBlockAt,
        lastHealthCheckAt: snapshot.lastHealthCheckAt,
        lastError: snapshot.lastError,
      });
      return;
    }

    if (url === '/status') {
      json(res, 200, {
        service: 'cour-monitor',
        network: deployment.network,
        chainId: deployment.chainId,
        addresses: {
          factory: deployment.factory,
          feeVault: deployment.feeVault,
          router: deployment.router,
          hook: deployment.hook,
          priceReader: deployment.priceReader,
          deployer: deployment.deployer,
          nvda: deployment.nvda,
        },
        snapshot,
        alerts: alertStats(),
      });
      return;
    }

    json(res, 404, { error: 'not found', endpoints: ['/health', '/status'] });
  });

  server.listen(config.httpPort, config.httpHost, () => {
    logger.info('HTTP status server listening', { host: config.httpHost, port: config.httpPort });
  });
  return server;
}
