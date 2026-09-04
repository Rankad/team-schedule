import { describe, it, expect } from "vitest";
import { weekKeyOf } from "../week.js";

describe("weekKeyOf", () => {
  it("returns the same date for a Sunday", () => {
    expect(weekKeyOf("2026-09-06")).toBe("2026-09-06"); // 2026-09-06 is a Sunday
  });
  it("rolls back to the prior Sunday mid-week", () => {
    expect(weekKeyOf("2026-09-09")).toBe("2026-09-06"); // Wednesday
    expect(weekKeyOf("2026-09-12")).toBe("2026-09-06"); // Saturday
  });
  it("crosses a month boundary", () => {
    expect(weekKeyOf("2026-10-01")).toBe("2026-09-27"); // Thu -> prior Sun
  });
});
