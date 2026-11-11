// Deterministic indexer fixture server for the mock E2E. Serves the same REST
// shape as the real Ponder indexer (indexer/src/api) so the UI renders REAL
// (fixed) data without a chain or database. Used by playwright.config.ts.
import { createServer } from "node:http";

const PORT = Number(process.env.FIXTURE_PORT || 4788);

const TOKENS = [
  {
    address: "0x9662f473d5810aa832ed4282bcb0b0f3348fa7bc",
    curve: "0x1111111111111111111111111111111111111111",
    name: "COUR Smoke",
    symbol: "CSMOKE",
    metadataURI: null,
    creator: "0x1eb25d02fc7c5487d4648a602c355dbc2301030b",
    stock: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
    stockDecimals: 18,
    feeBps: 400,
    mode: 3,
    feeRecipient: null,
    startPriceX: "0",
    launchedAt: Math.floor(Date.now() / 1000) - 3600,
    launchBlock: 106215255,
    graduated: false,
    graduatedAt: null,
    poolId: null,
    positionId: null,
    vS: "1000000000000000000000",
    vT: "800000000000000000000000000",
    vT0: "1000000000000000000000000000",
    vTStop: "205000000000000000000000000",
    progressBps: 2500,
    lastPriceStock: 0.0000012,
    lastPriceUsd: 0.00024,
    volumeStock: 12.5,
    volumeUsd: 2680,
    tradeCount: 42,
    lastTradeAt: Math.floor(Date.now() / 1000) - 120,
    holderCount: 7,
  },
  {
    address: "0x2222222222222222222222222222222222222222",
    curve: "0x3333333333333333333333333333333333333333",
    name: "Graduated One",
    symbol: "GRAD1",
    metadataURI: null,
    creator: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
    stock: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
    stockDecimals: 18,
    feeBps: 100,
    mode: 2,
    feeRecipient: null,
    startPriceX: "0",
    launchedAt: Math.floor(Date.now() / 1000) - 864000,
    launchBlock: 106000000,
    graduated: true,
    graduatedAt: Math.floor(Date.now() / 1000) - 86400,
    poolId: "0x4444444444444444444444444444444444444444444444444444444444444444",
    positionId: "0",
    vS: "0",
    vT: "0",
    vT0: "1000000000000000000000000000",
    vTStop: "205000000000000000000000000",
    progressBps: 10000,
    lastPriceStock: 0.0000031,
    lastPriceUsd: 0.00062,
    volumeStock: 980,
    volumeUsd: 210000,
    tradeCount: 5100,
    lastTradeAt: Math.floor(Date.now() / 1000) - 600,
    holderCount: 430,
  },
];

function candles(token) {
  const now = Math.floor(Date.now() / 1000);
  const out = [];
  let p = 0.0002;
  for (let i = 60; i > 0; i--) {
    const o = p;
    p = Math.max(0.00005, p * (1 + Math.sin(i / 7) * 0.03));
    const c = p;
    const hi = Math.max(o, c) * 1.01;
    const lo = Math.min(o, c) * 0.99;
    out.push({
      id: `${token}-1m-${now - i * 60}`,
      token,
      interval: "1m",
      bucketTs: now - i * 60,
      openStock: o * 0.5,
      highStock: hi * 0.5,
      lowStock: lo * 0.5,
      closeStock: c * 0.5,
      openUsd: o,
      highUsd: hi,
      lowUsd: lo,
      closeUsd: c,
      volumeStock: 10 + (i % 5),
      volumeUsd: 2000 + i * 11,
      ts: now - i * 60,
    });
  }
  return out;
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const send = (obj) => res.end(JSON.stringify(obj));

  if (p === "/stats") {
    return send({ totalTokens: 2, totalGraduated: 1, totalTrades: 5142, totalVolumeUsd: 212680, uniqueHolders: 437 });
  }
  if (p === "/tokens") {
    return send({ filter: url.searchParams.get("filter") || "trending", tokens: TOKENS });
  }
  if (p.startsWith("/token/")) {
    const addr = p.slice("/token/".length).toLowerCase();
    const t = TOKENS.find((x) => x.address === addr);
    return t ? send(t) : (res.statusCode = 404) && send({ error: "not found" });
  }
  if (p === "/candles") {
    const token = (url.searchParams.get("token") || TOKENS[0].address).toLowerCase();
    return send({ token, interval: url.searchParams.get("interval") || "1m", candles: candles(token) });
  }
  if (p === "/trades") {
    return send({ trades: [] });
  }
  if (p === "/holders") {
    const token = (url.searchParams.get("token") || TOKENS[0].address).toLowerCase();
    return send({ token, count: 1, holders: [{ id: `${token}-x`, token, address: "0x1eb25d02fc7c5487d4648a602c355dbc2301030b", balance: "1000000000000000000000", isExcluded: false }] });
  }
  if (p.startsWith("/portfolio/")) {
    const addr = p.slice("/portfolio/".length).toLowerCase();
    return send({
      address: addr,
      stats: { address: addr, volumeUsd: 1234, tradeCount: 9, launchCount: 1 },
      totalValueUsd: 61.2,
      positions: [
        { token: TOKENS[0].address, balance: "255000000000000000000000", balanceWhole: 255000, name: "COUR Smoke", symbol: "CSMOKE", lastPriceStock: 0.0000012, lastPriceUsd: 0.00024, graduated: false, valueUsd: 61.2 },
      ],
    });
  }
  if (p === "/top-users") {
    return send({ users: [{ address: "0x1eb25d02fc7c5487d4648a602c355dbc2301030b", volumeUsd: 99000, tradeCount: 120, launchCount: 3 }] });
  }
  res.statusCode = 404;
  send({ error: "unknown endpoint", path: p });
});

server.listen(PORT, () => console.log(`[fixture-indexer] listening on http://localhost:${PORT}`));
