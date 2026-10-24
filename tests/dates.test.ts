import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, isValidIsoDate, todayIn } from "../src/shared/dates";

describe("isValidIsoDate", () => {
  it("accepts real dates and rejects impossible or malformed ones", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-1-1")).toBe(false);
    expect(isValidIsoDate("0050-01-01")).toBe(false);
  });
});

describe("addDays / diffDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days", () => {
    expect(diffDays("2026-01-01", "2026-01-15")).toBe(14);
    expect(diffDays("2026-01-15", "2026-01-01")).toBe(-14);
  });
});

describe("addMonths", () => {
  it("clamps to the end of shorter months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("does not drift: counting from the start keeps the original day", () => {
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
  });

  it("handles year rollover and negative offsets", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-15");
  });
});

describe("todayIn", () => {
  it("returns the calendar date in the requested time zone", () => {
    const instant = new Date("2026-10-24T20:00:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-10-24");
    expect(todayIn("Australia/Adelaide", instant)).toBe("2026-10-25");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-24");
  });
});
