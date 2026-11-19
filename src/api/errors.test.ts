import { describe, expect, it } from "vitest";
import { errorMessage, isNotAnAdmin, toApiError } from "./errors";

describe("toApiError", () => {
  it("reads business errors", () => {
    const e = toApiError(409, {
      error: { code: "AMBIGUOUS_RATE_RULE", message: "Add a rule for BSC-CS level 2 first", details: { tie: ["a", "b"] } },
    });
    expect(e.status).toBe(409);
    expect(e.code).toBe("AMBIGUOUS_RATE_RULE");
    expect(e.message).toBe("Add a rule for BSC-CS level 2 first");
    expect(e.details).toEqual({ tie: ["a", "b"] });
  });

  it("reads validation errors with a list", () => {
    const e = toApiError(400, { statusCode: 400, message: ["amount must be a string", "name too short"], error: "Bad Request" });
    expect(e.code).toBe("VALIDATION");
    expect(e.messages).toEqual(["amount must be a string", "name too short"]);
    expect(e.message).toBe("amount must be a string; name too short");
  });

  it("reads validation errors with a single string", () => {
    const e = toApiError(400, { statusCode: 400, message: "Range too long", error: "Bad Request" });
    expect(e.messages).toEqual(["Range too long"]);
  });

  it("copes with junk", () => {
    expect(toApiError(500, "<html>").message).toMatch(/server/);
    expect(toApiError(404, undefined).code).toBe("NOT_FOUND");
  });
});

describe("errorMessage", () => {
  it("explains Monime outages", () => {
    expect(errorMessage(toApiError(503, { error: { code: "UPSTREAM_UNAVAILABLE", message: "monime 502" } }))).toBe(
      "Monime is unavailable, try again.",
    );
  });
  it("shows the server message otherwise", () => {
    expect(errorMessage(toApiError(409, { error: { code: "INVALID_STATE", message: "Only DEAD messages can be retried" } }))).toBe(
      "Only DEAD messages can be retried",
    );
  });
});

describe("isNotAnAdmin", () => {
  it("is FORBIDDEN, not MFA_REQUIRED", () => {
    expect(isNotAnAdmin(toApiError(403, { error: { code: "FORBIDDEN", message: "Not an active UNIMAK admin" } }))).toBe(true);
    expect(isNotAnAdmin(toApiError(403, { error: { code: "MFA_REQUIRED", message: "2FA" } }))).toBe(false);
  });
});
