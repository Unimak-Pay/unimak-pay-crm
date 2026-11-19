import { afterEach, describe, expect, it, vi } from "vitest";
import { api, authFetch, call, onApiEvent, setTokenSource } from "./client";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(...responses: Response[]) {
  const f = vi.fn<typeof fetch>(async () => responses.shift() ?? new Response(null, { status: 500 }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("authFetch", () => {
  it("adds the bearer token", async () => {
    setTokenSource({ getToken: async () => "t1", refresh: async () => null });
    const f = stubFetch(Response.json({ ok: true }));
    await authFetch(new Request("http://app/api/unimak/v1/admin/me"));
    expect((f.mock.calls[0][0] as Request).headers.get("authorization")).toBe("Bearer t1");
  });

  it("refreshes once after a 401 and retries with the new token and the same body", async () => {
    const refresh = vi.fn(async () => "t2");
    setTokenSource({ getToken: async () => "t1", refresh });
    const f = stubFetch(new Response(null, { status: 401 }), Response.json({ ok: true }));
    const res = await authFetch(new Request("http://app/x", { method: "POST", body: '{"a":1}' }));
    expect(res.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    const second = f.mock.calls[1][0] as Request;
    expect(second.headers.get("authorization")).toBe("Bearer t2");
    expect(await second.text()).toBe('{"a":1}');
  });

  it("does not loop on a second 401 and reports the dead session", async () => {
    setTokenSource({ getToken: async () => "t1", refresh: async () => "t2" });
    const events: string[] = [];
    const off = onApiEvent((e) => events.push(e.type));
    const f = stubFetch(new Response(null, { status: 401 }), new Response(null, { status: 401 }));
    const res = await authFetch(new Request("http://app/x"));
    expect(res.status).toBe(401);
    expect(f).toHaveBeenCalledTimes(2);
    expect(events).toEqual(["unauthenticated"]);
    off();
  });
});

describe("call", () => {
  it("returns data", async () => {
    setTokenSource({ getToken: async () => "t", refresh: async () => null });
    stubFetch(Response.json({ id: "1", email: "a@b.c" }));
    vi.stubGlobal("location", new URL("http://localhost/"));
    const me = await call(api.GET("/v1/admin/me", { baseUrl: "http://localhost/api/unimak" }));
    expect(me.email).toBe("a@b.c");
  });

  it("throws ApiError and announces MFA_REQUIRED", async () => {
    setTokenSource({ getToken: async () => "t", refresh: async () => null });
    const events: string[] = [];
    const off = onApiEvent((e) => events.push(e.type));
    stubFetch(Response.json({ error: { code: "MFA_REQUIRED", message: "2FA please" } }, { status: 403 }));
    await expect(call(api.GET("/v1/admin/me", { baseUrl: "http://localhost/api/unimak" }))).rejects.toMatchObject({
      code: "MFA_REQUIRED",
      status: 403,
    });
    expect(events).toEqual(["mfa_required"]);
    off();
  });
});
