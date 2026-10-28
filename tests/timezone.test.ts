import { describe, expect, it } from "vitest";
import { instantOf, isValidZone, wallOf } from "../src/shared/timezone";

const wall = (year: number, month: number, day: number, hour: number, minute: number) => ({ year, month, day, hour, minute, second: 0 });

describe("isValidZone", () => {
  it("accepts IANA names and rejects anything else", () => {
    expect(isValidZone("Australia/Darwin")).toBe(true);
    expect(isValidZone("AUS Eastern Standard Time")).toBe(false);
    expect(isValidZone("")).toBe(false);
  });
});

describe("wallOf", () => {
  it("reads the wall clock in the zone", () => {
    // Darwin is UTC+9:30 all year.
    expect(wallOf(Date.UTC(2026, 7, 20, 0, 0), "Australia/Darwin")).toEqual({ date: "2026-08-20", time: "09:30" });
  });

  it("moves to the next day when the zone is ahead of UTC", () => {
    // Sydney is UTC+11 in late October.
    expect(wallOf(Date.UTC(2026, 9, 27, 22, 30), "Australia/Sydney")).toEqual({ date: "2026-10-28", time: "09:30" });
  });
});

describe("instantOf", () => {
  it("is the inverse of wallOf", () => {
    const ms = instantOf(wall(2026, 8, 20, 8, 30), "Australia/Darwin");
    expect(ms).toBe(Date.UTC(2026, 7, 19, 23, 0));
    expect(wallOf(ms, "Australia/Darwin")).toEqual({ date: "2026-08-20", time: "08:30" });
  });

  it("follows daylight saving", () => {
    // Sydney clocks go forward at 2am on 4 Oct 2026: 22:00 the evening before is UTC+10, 06:00 is UTC+11.
    const start = instantOf(wall(2026, 10, 3, 22, 0), "Australia/Sydney");
    const end = instantOf(wall(2026, 10, 4, 6, 0), "Australia/Sydney");
    expect((end - start) / 3_600_000).toBe(7);
  });

  it("takes the first pass of a time that happens twice, as RFC 5545 says", () => {
    // Sydney clocks go back at 3am on 5 Apr 2026 (to 2am), so 02:30 happens at 15:30Z and again at 16:30Z.
    expect(instantOf(wall(2026, 4, 5, 2, 30), "Australia/Sydney")).toBe(Date.UTC(2026, 3, 4, 15, 30));
  });

  it("puts a time skipped by the clocks going forward just after the gap", () => {
    // Sydney skips 02:00 to 03:00 on 4 Oct 2026, so 02:30 doesn't exist; 03:30 AEDT is 16:30Z the day before.
    expect(instantOf(wall(2026, 10, 4, 2, 30), "Australia/Sydney")).toBe(Date.UTC(2026, 9, 3, 16, 30));
  });

  it("is not thrown by times either side of a change", () => {
    expect(wallOf(instantOf(wall(2026, 4, 5, 1, 59), "Australia/Sydney"), "Australia/Sydney").time).toBe("01:59");
    expect(wallOf(instantOf(wall(2026, 4, 5, 3, 0), "Australia/Sydney"), "Australia/Sydney").time).toBe("03:00");
    expect(wallOf(instantOf(wall(2026, 10, 4, 3, 0), "Australia/Sydney"), "Australia/Sydney").time).toBe("03:00");
  });

  it("works in UTC", () => {
    expect(instantOf(wall(2026, 1, 1, 0, 0), "UTC")).toBe(Date.UTC(2026, 0, 1));
  });
});
