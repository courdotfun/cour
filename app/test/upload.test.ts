import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/upload/route";

const SAVE = process.env.PINATA_JWT;
afterEach(() => {
  if (SAVE === undefined) delete process.env.PINATA_JWT;
  else process.env.PINATA_JWT = SAVE;
});

describe("upload route (no network)", () => {
  it("returns 500 upload_unavailable when PINATA_JWT unset", async () => {
    delete process.env.PINATA_JWT;
    const res = await POST(new Request("http://x/api/upload", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("upload_unavailable");
  });

  it("rejects unsupported content type (415)", async () => {
    process.env.PINATA_JWT = "test";
    const res = await POST(new Request("http://x/api/upload", { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" }));
    expect(res.status).toBe(415);
  });

  it("rejects metadata with no name/symbol (400)", async () => {
    process.env.PINATA_JWT = "test";
    const res = await POST(new Request("http://x/api/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: "x" }) }));
    expect(res.status).toBe(400);
  });

  it("never leaks the JWT in error bodies", async () => {
    process.env.PINATA_JWT = "super-secret-jwt";
    const res = await POST(new Request("http://x/api/upload", { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" }));
    expect(JSON.stringify(await res.json())).not.toContain("super-secret-jwt");
  });
});
