import { describe, expect, it } from "vitest";
import {
  compareMinor,
  formatSle,
  formatSleNumber,
  formatSleOrDash,
  formatSleSigned,
  parseSleInput,
  sleInWords,
  subtractMinor,
  sumMinor,
} from "./money";

describe("formatSle", () => {
  it.each([
    ["150000", "SLE 1,500.00"],
    ["0", "SLE 0.00"],
    ["5", "SLE 0.05"],
    ["99", "SLE 0.99"],
    ["100", "SLE 1.00"],
    ["123456789", "SLE 1,234,567.89"],
    ["-5", "-SLE 0.05"],
    ["-150000", "-SLE 1,500.00"],
    ["999999999999999999", "SLE 9,999,999,999,999,999.99"],
  ])("%s → %s", (minor, out) => expect(formatSle(minor)).toBe(out));

  it("accepts bigint", () => expect(formatSle(150050n)).toBe("SLE 1,500.50"));
  it("rejects non-integers", () => {
    expect(() => formatSle("1.5")).toThrow();
    expect(() => formatSle("abc")).toThrow();
    expect(() => formatSle("")).toThrow();
  });
  it("number part", () => expect(formatSleNumber("-123400")).toBe("-1,234.00"));
  it("dash for missing", () => {
    expect(formatSleOrDash(null)).toBe("—");
    expect(formatSleOrDash(undefined)).toBe("—");
    expect(formatSleOrDash("100")).toBe("SLE 1.00");
  });
});

describe("parseSleInput", () => {
  it.each([
    ["1500", "150000"],
    ["1,500.50", "150050"],
    ["1500.5", "150050"],
    ["1500.", "150000"],
    ["0.01", "1"],
    ["  2,000  ", "200000"],
    ["SLE 1,234,567.89", "123456789"],
    ["007", "700"],
    ["9999999999999999.99", "999999999999999999"],
  ])("%s → %s", (input, minor) => expect(parseSleInput(input)).toEqual({ ok: true, minor }));

  it.each([
    ["", "Enter an amount"],
    ["0", "greater than zero"],
    ["0.00", "greater than zero"],
    ["-5", "greater than zero"],
    ["1.234", "2 decimal"],
    ["1,50", "like 1500"],
    ["1,5000", "like 1500"],
    ["12,34,567", "like 1500"],
    ["1e5", "like 1500"],
    ["abc", "like 1500"],
    ["1 500", "like 1500"],
    ["10000000000000000", "too large"],
  ])("rejects %j", (input, msg) => {
    const r = parseSleInput(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it("never goes through floats (0.1 + 0.2 style inputs stay exact)", () => {
    expect(parseSleInput("0.30")).toEqual({ ok: true, minor: "30" });
    expect(parseSleInput("1234567890123.07")).toEqual({ ok: true, minor: "123456789012307" });
  });
});

describe("arithmetic", () => {
  it("compares", () => {
    expect(compareMinor("100", "99")).toBe(1);
    expect(compareMinor("99", "100")).toBe(-1);
    expect(compareMinor("100", "100")).toBe(0);
    expect(compareMinor("999999999999999999", "999999999999999998")).toBe(1);
  });
  it("sums and subtracts exactly", () => {
    expect(sumMinor("999999999999999999", "1")).toBe("1000000000000000000");
    expect(sumMinor()).toBe("0");
    expect(subtractMinor("100", "250")).toBe("-150");
  });
});

describe("sleInWords", () => {
  it.each([
    ["150000", "One thousand five hundred leones"],
    ["150050", "One thousand five hundred leones and fifty cents"],
    ["100", "One leone"],
    ["1", "Zero leones and one cent"],
    ["100500", "One thousand and five leones"],
    ["12345678", "One hundred and twenty-three thousand four hundred and fifty-six leones and seventy-eight cents"],
    ["100000000", "One million leones"],
    ["2500000021", "Twenty-five million leones and twenty-one cents"],
  ])("%s", (minor, words) => expect(sleInWords(minor)).toBe(words));
});

describe("formatSleSigned", () => {
  it.each([
    ["25000", "+SLE 250.00"],
    ["-25000", "-SLE 250.00"],
    ["0", "SLE 0.00"],
    ["-5", "-SLE 0.05"],
  ])("%s → %s", (minor, out) => expect(formatSleSigned(minor)).toBe(out));
});
