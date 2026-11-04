import { formatEther, formatUnits } from 'viem';
import { factoryAbi, feeVaultAbi, priceReaderAbi, routerAbi, stockProbeAbi } from '../abi/index.js';
import { publicClient } from './chain.js';
import { config, deployment } from './config.js';
import { logger } from './logger.js';
import { snapshot, setLastBlock } from './state.js';
import { sendAlert } from './telegram.js';

let timer: NodeJS.Timeout | undefined;
let prevPrice: number | null = null;

async function readBlock(): Promise<void> {
  const block = await publicClient().getBlockNumber();
  setLastBlock(block);
}

async function readDeployerBalance(): Promise<void> {
  const wei = await publicClient().getBalance({ address: deployment.deployer });
  const eth = Number(formatEther(wei));
  snapshot.deployerEth = eth.toFixed(6);
  if (eth < config.deployerMinEth) {
    await sendAlert({
      severity: 'warn',
      title: 'Deployer ETH balance low',
      body: 'Admin ops (pause, config) need gas.',
      dedupeKey: 'deployer-low-eth',
      data: { deployer: deployment.deployer, eth: snapshot.deployerEth, threshold: config.deployerMinEth },
    });
  }
}

async function readStockPrice(): Promise<void> {
  try {
    const [priceX18, source] = (await publicClient().readContract({
      address: deployment.priceReader,
      abi: priceReaderAbi,
      functionName: 'stockUsd',
      args: [deployment.nvda],
    })) as [bigint, number];

    const price = Number(formatUnits(priceX18, 18));
    snapshot.stockUsdNvda = price.toFixed(4);
    snapshot.stockUsdSource = Number(source);
    snapshot.twapReady = true;

    if (prevPrice !== null && prevPrice > 0) {
      const devPct = (Math.abs(price - prevPrice) / prevPrice) * 100;
      if (devPct >= config.stockDeviationPct) {
        await sendAlert({
          severity: 'warn',
          title: 'Stock price (NVDA) sharp deviation',
          dedupeKey: 'stock-deviation',
          data: { prev: prevPrice.toFixed(4), now: price.toFixed(4), deviationPct: devPct.toFixed(2), threshold: config.stockDeviationPct },
        });
      }
    }
    prevPrice = price;
  } catch (err) {
    // Most likely TwapNotReady / stale oracle — the price read reverted.
    snapshot.twapReady = false;
    const msg = (err as Error).message?.split('\n')[0] ?? 'unknown';
    await sendAlert({
      severity: 'critical',
      title: 'PriceReader.stockUsd(NVDA) reverted (TWAP not ready / oracle anomaly)',
      dedupeKey: 'stock-read-revert',
      data: { priceReader: deployment.priceReader, nvda: deployment.nvda, reason: msg.slice(0, 180) },
    });
  }
}

async function readPausedState(): Promise<void> {
  const client = publicClient();
  const [paused, allowlist] = await Promise.all([
    client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: 'launchesPaused' }) as Promise<boolean>,
    client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: 'launchAllowlistEnabled' }) as Promise<boolean>,
  ]);

  if (snapshot.launchesPaused !== null && snapshot.launchesPaused !== paused) {
    await sendAlert({
      severity: paused ? 'critical' : 'warn',
      title: `factory.launchesPaused changed to ${paused}`,
      dedupeKey: `launches-paused-${paused}`,
      data: { factory: deployment.factory, paused },
    });
  }
  snapshot.launchesPaused = paused;
  snapshot.launchAllowlistEnabled = allowlist;
}

async function readOwners(): Promise<void> {
  const client = publicClient();
  const targets: Array<[string, `0x${string}`, readonly unknown[]]> = [
    ['factory', deployment.factory, factoryAbi],
    ['feeVault', deployment.feeVault, feeVaultAbi],
    ['router', deployment.router, routerAbi],
    ['priceReader', deployment.priceReader, priceReaderAbi],
  ];
  for (const [label, addr, abi] of targets) {
    try {
      const owner = (await client.readContract({ address: addr, abi: abi as never, functionName: 'owner' })) as string;
      const prev = snapshot.owners[label];
      if (prev && prev.toLowerCase() !== owner.toLowerCase()) {
        await sendAlert({
          severity: 'critical',
          title: `Owner of ${label} changed`,
          dedupeKey: `owner-${label}-${owner}`,
          data: { contract: addr, previousOwner: prev, newOwner: owner },
        });
      }
      snapshot.owners[label] = owner;
    } catch (err) {
      logger.warn(`owner() read failed for ${label}`, { error: (err as Error).message.split('\n')[0] });
    }
  }
}

// Best-effort probe: many stock tokens expose paused(); if the call reverts the
// function likely does not exist, so we record null (= manual check required).
async function readStockPausedProbe(): Promise<void> {
  try {
    const paused = (await publicClient().readContract({
      address: deployment.nvda,
      abi: stockProbeAbi,
      functionName: 'paused',
    })) as boolean;
    if (snapshot.stockPaused === false && paused === true) {
      await sendAlert({
        severity: 'critical',
        title: 'Stock issuer appears to have PAUSED the stock token',
        dedupeKey: 'stock-paused',
        data: { stock: deployment.nvda },
      });
    }
    snapshot.stockPaused = paused;
  } catch {
    // paused() not supported by this stock token — leave null, see runbook (manual check).
    snapshot.stockPaused = null;
  }
}

async function runOnce(): Promise<void> {
  try {
    await Promise.all([
      readBlock(),
      readDeployerBalance(),
      readStockPrice(),
      readPausedState(),
      readOwners(),
      readStockPausedProbe(),
    ]);
    snapshot.lastHealthCheckAt = new Date().toISOString();
    snapshot.lastError = null;
    logger.info('health', {
      block: snapshot.lastBlock,
      deployerEth: snapshot.deployerEth,
      stockUsdNvda: snapshot.stockUsdNvda,
      stockSource: snapshot.stockUsdSource,
      twapReady: snapshot.twapReady,
      launchesPaused: snapshot.launchesPaused,
      allowlistEnabled: snapshot.launchAllowlistEnabled,
      stockPaused: snapshot.stockPaused,
    });
  } catch (err) {
    snapshot.lastError = (err as Error).message.split('\n')[0];
    logger.warn('health check failed', { error: snapshot.lastError });
  }
}

/** Run the health loop immediately, then on an interval. Returns a stop function. */
export async function startHealthLoop(): Promise<() => void> {
  await runOnce();
  timer = setInterval(() => void runOnce(), config.healthIntervalMs);
  return () => {
    if (timer) clearInterval(timer);
  };
}
