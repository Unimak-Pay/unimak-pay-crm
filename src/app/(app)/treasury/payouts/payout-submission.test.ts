import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { classifyFailure, newIdempotencyKey } from "./payout-submission";

const err = (status: number, code: string) => new ApiError({ status, code, message: code });

describe("classifyFailure", () => {
  it("treats network and server errors as uncertain (retry with the same key, unchanged)", () => {
    expect(classifyFailure(err(0, "NETWORK"))).toBe("uncertain");
    expect(classifyFailure(err(502, "BACKEND_UNAVAILABLE"))).toBe("uncertain");
    expect(classifyFailure(err(503, "UPSTREAM_UNAVAILABLE"))).toBe("uncertain");
    expect(classifyFailure(err(504, "BACKEND_UNAVAILABLE"))).toBe("uncertain");
    expect(classifyFailure(new Error("boom"))).toBe("uncertain");
  });
  it("treats an idempotency conflict as uncertain", () => {
    expect(classifyFailure(err(409, "IDEMPOTENCY_CONFLICT"))).toBe("uncertain");
  });
  it("treats refusals as definitive", () => {
    expect(classifyFailure(err(400, "VALIDATION"))).toBe("definitive");
    expect(classifyFailure(err(403, "FORBIDDEN"))).toBe("definitive");
    expect(classifyFailure(err(422, "AMOUNT_EXCEEDS_PAYABLE"))).toBe("definitive");
    expect(classifyFailure(err(404, "NOT_FOUND"))).toBe("definitive");
  });
});

describe("newIdempotencyKey", () => {
  it("is a UUID within the API's 8–64 length", () => {
    const k = newIdempotencyKey();
    expect(k).toMatch(/^[0-9a-f-]{36}$/);
    expect(k.length).toBeGreaterThanOrEqual(8);
    expect(newIdempotencyKey()).not.toBe(k);
  });
});
