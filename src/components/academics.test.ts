import { describe, expect, it } from "vitest";
import { type Faculty, usableGroups } from "./academics";

const at = "2026-01-01T00:00:00Z";
const dept = (code: string, name: string, extra: Partial<Faculty["departments"][number]> = {}) => ({
  id: code, code, name, facultyId: "f", active: true, needsReview: false, createdAt: at, updatedAt: at, ...extra,
});
const faculty = (code: string, name: string, departments: Faculty["departments"], active = true): Faculty => ({
  id: code, code, name, active, createdAt: at, updatedAt: at, departments,
});

const data = [
  faculty("FAC-SCI", "Science", [dept("MATHS", "Mathematics", { active: false }), dept("IT", "Information Technology"), dept("CS", "Computer Science")]),
  faculty("FAC-AGRIC", "Agriculture", [dept("AGRO", "Agronomy")], false),
  faculty("FAC-ARTS", "Arts", [dept("ODD", "ODD", { needsReview: true })]),
  faculty("FAC-LAW", "Law", [dept("LAW", "Law")]),
];

describe("usableGroups (what department dropdowns offer)", () => {
  it("only active, reviewed departments of active faculties, grouped and sorted by name", () => {
    expect(usableGroups(data).map((g) => [g.faculty.name, g.departments.map((d) => d.code)])).toEqual([
      ["Law", ["LAW"]],
      ["Science", ["CS", "IT"]],
    ]);
  });

  it("can be limited to an admin's scope", () => {
    expect(usableGroups(data, ["IT", "MATHS"]).map((g) => g.departments.map((d) => d.code))).toEqual([["IT"]]);
  });
});
