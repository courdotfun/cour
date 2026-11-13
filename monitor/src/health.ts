import { formatEther, formatUnits } from 'viem';
import { factoryAbi, priceReaderAbi, stockProbeAbi } from '../abi/index.js';
import { publicClient } from './chain.js';
import { config, deployment } from './config.js';
import { logger } from './logger.js';
import { snapshot, setLastBlock } from './state.js';
import { sendAlert } from './telegram.js';

let timer: NodeJS.Timeout | undefined;
let prevPrice: number | null = null;

// Minimal Ownable2Step ABI (owner + pendingOwner) — used for all four contracts.
const ownable2StepAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pendingOwner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

async function readBlock(): Promise<void> {
  const block = await publicClient().getBlockNumber();
  setLastBlock(block);
}

// Watch the Safe owners' ETH balances (they need gas to execute Safe txs —
// incident pause, config). Replaces deployer monitoring: once ownership is the
// Safe, the deployer EOA is powerless and irrelevant.
async function readOwnerBalances(): Promise<void> {
  const owners = deployment.safeOwners;
  if (owners.length === 0) return; // no Safe owners configured
  const client = publicClient();
  for (const owner of owners) {
    const wei = await client.getBalance({ address: owner });
    const eth = Number(formatEther(wei));
    snapshot.ownerBalances[owner] = eth.toFixed(6);
    if (eth < config.ownerMinEth) {
      await sendAlert({
        severity: 'warn',
        title: 'Safe owner ETH balance low',
        body: 'Safe owners need gas to execute 2-of-3 txs (incident pause, config).',
        dedupeKey: `owner-low-eth-${owner.toLowerCase()}`,
        data: { owner, eth: snapshot.ownerBalances[owner], threshold: config.ownerMinEth },
      });
    }
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
  const targets: Array<[string, `0x${string}`]> = [
    ['factory', deployment.factory],
    ['feeVault', deployment.feeVault],
    ['router', deployment.router],
    ['priceReader', deployment.priceReader],
  ];
  for (const [label, addr] of targets) {
    try {
      const [owner, pending] = (await Promise.all([
        client.readContract({ address: addr, abi: ownable2StepAbi, functionName: 'owner' }),
        client
          .readContract({ address: addr, abi: ownable2StepAbi, functionName: 'pendingOwner' })
          .catch(() => ZERO_ADDR),
      ])) as [string, string];

      const prev = snapshot.owners[label];
      if (prev && prev.toLowerCase() !== owner.toLowerCase()) {
        await sendAlert({
          severity: 'critical',
          title: `Owner of ${label} changed`,
          dedupeKey: `owner-${label}-${owner}`,
          data: { contract: addr, previousOwner: prev, newOwner: owner },
        });
      }
      const prevPending = snapshot.pendingOwners[label];
      if (prevPending !== undefined && prevPending.toLowerCase() !== pending.toLowerCase()) {
        await sendAlert({
          severity: 'warn',
          title: `pendingOwner of ${label} changed (ownership transfer initiated/cleared)`,
          dedupeKey: `pending-${label}-${pending}`,
          data: { contract: addr, previousPendingOwner: prevPending, newPendingOwner: pending },
        });
      }
      snapshot.owners[label] = owner;
      snapshot.pendingOwners[label] = pending;
    } catch (err) {
      logger.warn(`owner()/pendingOwner() read failed for ${label}`, { error: (err as Error).message.split('\n')[0] });
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
      readOwnerBalances(),
      readStockPrice(),
      readPausedState(),
      readOwners(),
      readStockPausedProbe(),
    ]);
    snapshot.lastHealthCheckAt = new Date().toISOString();
    snapshot.lastError = null;
    logger.info('health', {
      block: snapshot.lastBlock,
      ownerBalances: snapshot.ownerBalances,
      owners: snapshot.owners,
      pendingOwners: snapshot.pendingOwners,
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
