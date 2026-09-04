import { describe, it, expect } from "vitest";
import { computeDepartTimes } from "../depart.js";

const session = {
  start: "2026-09-08T17:00:00+03:00",
  end: "2026-09-08T18:30:00+03:00",
  location: "אולם קציר",
};

describe("computeDepartTimes", () => {
  it("uses the per-location offsets", () => {
    expect(computeDepartTimes(session, { outbound: 40, ret: 15 }, 15))
      .toEqual({ outbound: "16:20", ret: "18:45" });
  });
  it("falls back to retDefault when ret is null", () => {
    expect(computeDepartTimes(session, { outbound: 40, ret: null }, 20).ret).toBe("18:50");
  });
  it("null outbound when the location is unconfigured", () => {
    expect(computeDepartTimes(session, undefined, 15))
      .toEqual({ outbound: null, ret: "18:45" });
  });
  it("null ret when there is no default and no end", () => {
    expect(computeDepartTimes({ ...session, end: null }, { outbound: 40, ret: null }, null).ret).toBe(null);
  });
});
