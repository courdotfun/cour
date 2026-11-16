import { describe, it, expect } from "vitest";
import { normAddr, eqAddr } from "@/lib/util/address";
import { rateLimit } from "@/lib/server/ratelimit";
import { encodeSafeTx } from "@/lib/server/safe";
import { fromRaw, toRaw, progressPct } from "@/lib/ui/format";

describe("address util", () => {
  it("normalises valid addresses to lowercase", () => {
    expect(normAddr("0xDca6d36E44E848a7C4088Fb5d12FfDEd22EA7fA2")).toBe(
      "0xdca6d36e44e848a7c4088fb5d12ffded22ea7fa2",
    );
  });
  it("rejects junk", () => {
    expect(normAddr("0x123")).toBeNull();
    expect(normAddr("hello")).toBeNull();
    expect(normAddr(42)).toBeNull();
  });
  it("eqAddr is case-insensitive", () => {
    expect(eqAddr("0xABC0000000000000000000000000000000000000", "0xabc0000000000000000000000000000000000000")).toBe(true);
    expect(eqAddr(null, "0x0")).toBe(false);
  });
});

describe("rate limit", () => {
  it("allows up to the limit then blocks", () => {
    const key = "test:" + Math.random();
    expect(rateLimit(key, 3, 1000).ok).toBe(true);
    expect(rateLimit(key, 3, 1000).ok).toBe(true);
    expect(rateLimit(key, 3, 1000).ok).toBe(true);
    const over = rateLimit(key, 3, 1000);
    expect(over.ok).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
  });
});

describe("format helpers", () => {
  it("fromRaw / toRaw round-trip", () => {
    expect(fromRaw(1_000000000000000000n, 18)).toBe(1);
    expect(toRaw("1.5", 18)).toBe(1_500000000000000000n);
  });
  it("progressPct clamps bps", () => {
    expect(progressPct(10000)).toBe(100);
    expect(progressPct(0)).toBe(0);
  });
});

describe("safe-tx encoder", () => {
  // Cross-check against the already-proven pause artifact (script/safe/out/pause-true.env):
  // setLaunchesPaused(true) on the Factory, Safe nonce 0, operation 0.
  it("reproduces the published pause safeTxHash and calldata", () => {
    const r = encodeSafeTx("setLaunchesPaused", { paused: true }, 0n);
    const msg = (r.typed as any).message;
    expect(msg.to.toLowerCase()).toBe("0x771a90ff8e9be8dc9091494d9466c35d162c0f4c"); // Factory
    expect(msg.operation).toBe(0);
    expect(msg.data.toLowerCase()).toBe(
      "0x618701e50000000000000000000000000000000000000000000000000000000000000001",
    );
    expect(r.safeTxHash.toLowerCase()).toBe(
      "0xfddb48f06a6559f443f06b4dedec4e3f2552618c6fbf2e153ab84864a8b0a87a",
    );
  });

  it("encodes setLaunchesPaused(false) with the right selector", () => {
    const r = encodeSafeTx("setLaunchesPaused", { paused: false }, 0n);
    const data = (r.typed as any).message.data.toLowerCase();
    expect(data.startsWith("0x618701e5")).toBe(true);
    expect(data.endsWith("0".repeat(64))).toBe(true);
  });

  it("validates args and rejects unknown actions", () => {
    expect(() => encodeSafeTx("setLaunchesPaused", { paused: "yes" }, 0n)).toThrow();
    expect(() => encodeSafeTx("selfDestruct", {}, 0n)).toThrow();
  });

  it("encodes allowlist + params actions", () => {
    const a = encodeSafeTx(
      "setLaunchAllowlist",
      { account: "0xDca6d36E44E848a7C4088Fb5d12FfDEd22EA7fA2", allowed: true },
      5n,
    );
    expect((a.typed as any).message.nonce).toBe("5");
    const p = encodeSafeTx(
      "setLaunchParams",
      { startMcUsd: "4000", gradMcUsd: "60000", minRefLiqUsd: "50000", launchFee: "0" },
      0n,
    );
    expect((p.typed as any).message.to.toLowerCase()).toBe("0x771a90ff8e9be8dc9091494d9466c35d162c0f4c");
  });
});
