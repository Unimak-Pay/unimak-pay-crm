import { describe, expect, it } from "vitest";
import { classifyLinkError } from "./email-link-shared";

describe("classifyLinkError", () => {
  it.each([
    [{ code: "otp_expired", status: 403, message: "Email link is invalid or has expired" }],
    [{ status: 403, message: "Forbidden" }],
    [{ message: "Token has expired or is invalid" }],
  ])("treats %j as an expired/used link", (e) => expect(classifyLinkError(e)).toEqual({ ok: false, reason: "expired" }));

  it("passes other errors through", () => {
    expect(classifyLinkError({ status: 500, message: "Database error" })).toEqual({ ok: false, reason: "other", message: "Database error" });
  });
});
