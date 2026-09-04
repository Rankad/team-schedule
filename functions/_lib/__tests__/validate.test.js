import { describe, it, expect } from "vitest";
import { isSessionId, isTeamId, isDirection, isWeekKey, isNonEmptyName } from "../validate.js";

describe("validate", () => {
  it("isDirection", () => {
    expect(isDirection("round")).toBe(true);
    expect(isDirection("out")).toBe(true);
    expect(isDirection("back")).toBe(true);
    expect(isDirection("both")).toBe(false);
    expect(isDirection("")).toBe(false);
  });
  it("isWeekKey", () => {
    expect(isWeekKey("2026-09-06")).toBe(true);
    expect(isWeekKey("2026-9-6")).toBe(false);
    expect(isWeekKey("garbage")).toBe(false);
  });
  it("isTeamId", () => {
    expect(isTeamId("T_042")).toBe(true);
    expect(isTeamId("T_")).toBe(false);
    expect(isTeamId("X_1")).toBe(false);
  });
  it("isSessionId", () => {
    expect(isSessionId("a1b2c3d4e5f6g7h8i9j0k1l2m3")).toBe(true);
    expect(isSessionId("")).toBe(false);
    expect(isSessionId("has space")).toBe(false);
    expect(isSessionId("x".repeat(300))).toBe(false);
  });
  it("isNonEmptyName", () => {
    expect(isNonEmptyName("דניאל כהן")).toBe(true);
    expect(isNonEmptyName("   ")).toBe(false);
    expect(isNonEmptyName("x".repeat(81))).toBe(false);
  });
});
