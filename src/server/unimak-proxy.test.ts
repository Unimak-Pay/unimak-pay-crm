import { describe, expect, it, vi } from "vitest";
import { proxyToUnimak, upstreamPath } from "./unimak-proxy";

const LOCAL = { UNIMAK_API_URL: "http://localhost:3100" };
const PROD = { UNIMAK_API_URL: "https://unimak-pay-backend.vercel.app" };

function okFetch(body: unknown = { ok: true }, init: ResponseInit = {}) {
  return vi.fn<typeof fetch>(async () => Response.json(body, init));
}

describe("upstreamPath", () => {
  it.each([
    [["v1", "admin", "me"], "/v1/admin/me"],
    [["v1", "admin", "payments", "abc"], "/v1/admin/payments/abc"],
    [["v1", "admin", "reconciliation", "webhook-events", "evt 1"], "/v1/admin/reconciliation/webhook-events/evt%201"],
  ])("allows %j", (segs, out) => expect(upstreamPath(segs)).toBe(out));

  it.each([
    [["v1", "admin"]],
    [["v1", "channel", "payments"]],
    [["webhooks", "monime"]],
    [["cron", "outbox"]],
    [["dev", "monime", "simulate-webhook"]],
    [["v1", "admin", "..", "..", "cron", "outbox"]],
    [["v1", "admin", "."]],
    [["v1", "admin", "a/../../cron"]],
    [["v1", "admin", "a\\b"]],
    [["v1", "admin", ""]],
  ])("refuses %j", (segs) => expect(upstreamPath(segs)).toBeNull());
});

describe("proxyToUnimak", () => {
  it("forwards method, query, body and Authorization only", async () => {
    const f = okFetch({ id: "x" }, { status: 201 });
    const req = new Request("http://app/api/unimak/v1/admin/payouts?x=1&y=2", {
      method: "POST",
      headers: {
        authorization: "Bearer tok",
        "content-type": "application/json",
        cookie: "sb-session=secret",
        "x-evil": "1",
      },
      body: JSON.stringify({ amount: "100" }),
    });
    const res = await proxyToUnimak(req, ["v1", "admin", "payouts"], LOCAL, f);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "x" });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("http://localhost:3100/v1/admin/payouts?x=1&y=2");
    expect(init?.method).toBe("POST");
    const h = new Headers(init?.headers);
    expect(h.get("authorization")).toBe("Bearer tok");
    expect(h.get("cookie")).toBeNull();
    expect(h.get("x-evil")).toBeNull();
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"amount":"100"}');
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("404s non-admin paths without calling upstream", async () => {
    const f = okFetch();
    const res = await proxyToUnimak(new Request("http://app/api/unimak/cron/outbox"), ["cron", "outbox"], LOCAL, f);
    expect(res.status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });

  it("passes upstream errors through unchanged", async () => {
    const f = okFetch({ error: { code: "MFA_REQUIRED", message: "2FA" } }, { status: 403 });
    const res = await proxyToUnimak(new Request("http://app/x"), ["v1", "admin", "me"], LOCAL, f);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("MFA_REQUIRED");
  });

  it("forwards CSV download headers", async () => {
    const f = vi.fn<typeof fetch>(
      async () =>
        new Response("a,b\n", {
          headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="p.csv"', "set-cookie": "x=1" },
        }),
    );
    const res = await proxyToUnimak(new Request("http://app/x"), ["v1", "admin", "payments", "export.csv"], LOCAL, f);
    expect(res.headers.get("content-disposition")).toContain("p.csv");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toBe("a,b\n");
  });

  describe("production safety rail", () => {
    const post = () => new Request("http://app/x", { method: "POST", body: "{}" });

    it("blocks writes to the production host outside the production deployment", async () => {
      const f = okFetch();
      const res = await proxyToUnimak(post(), ["v1", "admin", "payouts"], PROD, f);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("PROD_WRITE_BLOCKED");
      expect(f).not.toHaveBeenCalled();
    });

    it("blocks on Vercel preview deployments too", async () => {
      const f = okFetch();
      const res = await proxyToUnimak(post(), ["v1", "admin", "payouts"], { ...PROD, VERCEL_ENV: "preview" }, f);
      expect(res.status).toBe(403);
    });

    it("allows reads to production", async () => {
      const f = okFetch();
      const res = await proxyToUnimak(new Request("http://app/x"), ["v1", "admin", "me"], PROD, f);
      expect(res.status).toBe(200);
    });

    it("allows writes on the production deployment or with an explicit opt-in", async () => {
      for (const env of [{ ...PROD, VERCEL_ENV: "production" }, { ...PROD, ALLOW_PROD_WRITES: "true" }]) {
        const f = okFetch();
        expect((await proxyToUnimak(post(), ["v1", "admin", "payouts"], env, f)).status).toBe(200);
      }
    });
  });

  it("maps network failures to BACKEND_UNAVAILABLE", async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const res = await proxyToUnimak(new Request("http://app/x"), ["v1", "admin", "me"], LOCAL, f);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("BACKEND_UNAVAILABLE");
  });

  it("reports a missing UNIMAK_API_URL", async () => {
    const res = await proxyToUnimak(new Request("http://app/x"), ["v1", "admin", "me"], {}, okFetch());
    expect(res.status).toBe(500);
  });

  it("rejects unsupported methods and oversized bodies", async () => {
    const f = okFetch();
    expect((await proxyToUnimak(new Request("http://app/x", { method: "OPTIONS" }), ["v1", "admin", "me"], LOCAL, f)).status).toBe(405);
    const big = new Request("http://app/x", { method: "POST", body: "x".repeat(1_000_001) });
    expect((await proxyToUnimak(big, ["v1", "admin", "me"], LOCAL, f)).status).toBe(413);
    expect(f).not.toHaveBeenCalled();
  });
});
