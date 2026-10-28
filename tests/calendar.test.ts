import { describe, expect, it } from "vitest";
import { parseCalendar, syncWindow, type ParseOptions } from "../src/shared/calendar";
import { ics, zoned } from "./helpers/ics";

const opts: ParseOptions = { fallbackZone: "Australia/Sydney", from: "2026-01-01", to: "2026-12-31" };

describe("parseCalendar", () => {
  it("reads a zoned event and keeps its wall-clock times", () => {
    const feed = ics([zoned("A", "Australia/Darwin", "20260820T083000", "20260820T174500")]);
    const { shifts } = parseCalendar(feed, opts);
    expect(shifts).toEqual([{ key: "A", date: "2026-08-20", start: "08:30", end: "17:45", hours: 9.25 }]);
  });

  it("takes the unpaid break off", () => {
    const feed = ics([zoned("A", "Australia/Darwin", "20260820T083000", "20260820T174500")]);
    expect(parseCalendar(feed, { ...opts, breakRule: "over5" }).shifts[0].hours).toBe(8.75);
    expect(parseCalendar(feed, { ...opts, breakRule: "over5", breakMinutes: 45 }).shifts[0].hours).toBe(8.5);
    expect(parseCalendar(feed, { ...opts, breakRule: "none" }).shifts[0].hours).toBe(9.25);
  });

  it("uses the time zone the events name when the calendar names none", () => {
    const feed = ics([zoned("A", "Australia/Darwin", "20260820T083000", "20260820T120000")]);
    expect(parseCalendar(feed, opts).zone).toEqual({ name: "Australia/Darwin", source: "events" });
  });

  it("prefers X-WR-TIMEZONE and puts UTC events on the local date", () => {
    const feed = ics(
      [["UID:G1", "DTSTART:20261027T223000Z", "DTEND:20261028T063000Z"]],
      ["X-WR-TIMEZONE:Australia/Sydney"],
    );
    const result = parseCalendar(feed, { ...opts, fallbackZone: "UTC" });
    expect(result.zone).toEqual({ name: "Australia/Sydney", source: "calendar" });
    expect(result.shifts).toEqual([{ key: "G1", date: "2026-10-28", start: "09:30", end: "17:30", hours: 8 }]);
  });

  it("reads floating times in the calendar's zone, and falls back when there is no zone at all", () => {
    const feed = ics([["UID:F1", "DTSTART:20260820T090000", "DTEND:20260820T130000"]]);
    const result = parseCalendar(feed, { ...opts, fallbackZone: "Australia/Perth" });
    expect(result.zone).toEqual({ name: "Australia/Perth", source: "fallback" });
    expect(result.shifts[0]).toMatchObject({ date: "2026-08-20", start: "09:00", end: "13:00", hours: 4 });
  });

  it("measures a shift across a daylight-saving change by elapsed time", () => {
    const feed = ics([zoned("D1", "Australia/Sydney", "20261003T220000", "20261004T060000")]);
    const [shift] = parseCalendar(feed, opts).shifts;
    expect(shift).toMatchObject({ date: "2026-10-03", start: "22:00", end: "06:00", hours: 7 });
  });

  it("dates an overnight shift by the day it starts", () => {
    const feed = ics([zoned("N1", "Australia/Darwin", "20260820T220000", "20260821T060000")]);
    expect(parseCalendar(feed, opts).shifts[0]).toMatchObject({ date: "2026-08-20", hours: 8 });
  });

  it("skips and counts all-day, cancelled and recurring events", () => {
    const feed = ics([
      ["UID:AD", "DTSTART;VALUE=DATE:20260820", "DTEND;VALUE=DATE:20260821"],
      zoned("CX", "Australia/Darwin", "20260821T090000", "20260821T130000", ["STATUS:CANCELLED"]),
      zoned("RR", "Australia/Darwin", "20260822T090000", "20260822T130000", ["RRULE:FREQ=WEEKLY"]),
      zoned("OK", "Australia/Darwin", "20260823T090000", "20260823T130000"),
    ]);
    const { shifts, stats } = parseCalendar(feed, opts);
    expect(shifts.map((s) => s.key)).toEqual(["OK"]);
    expect(stats).toMatchObject({ events: 4, allDay: 1, cancelled: 1, recurring: 1 });
  });

  it("counts events with no end, no length or too long", () => {
    const feed = ics([
      ["UID:NE", "DTSTART;TZID=Australia/Darwin:20260820T090000"],
      zoned("ZERO", "Australia/Darwin", "20260821T090000", "20260821T090000"),
      zoned("LONG", "Australia/Darwin", "20260822T000000", "20260823T010000"),
      ["DTSTART;TZID=Australia/Darwin:20260824T090000", "DTEND;TZID=Australia/Darwin:20260824T130000"],
    ]);
    const { shifts, stats } = parseCalendar(feed, opts);
    expect(shifts).toEqual([]);
    expect(stats.invalid).toBe(4);
  });

  it("uses DURATION when there is no DTEND", () => {
    const feed = ics([["UID:DU", "DTSTART;TZID=Australia/Darwin:20260820T090000", "DURATION:PT4H30M"]]);
    expect(parseCalendar(feed, opts).shifts[0]).toMatchObject({ end: "13:30", hours: 4.5 });
  });

  it("keeps only events whose title matches", () => {
    const feed = ics([
      zoned("W", "Australia/Darwin", "20260820T090000", "20260820T130000", ["SUMMARY:Work shift"]),
      zoned("D", "Australia/Darwin", "20260821T090000", "20260821T100000", ["SUMMARY:Dentist"]),
    ]);
    const { shifts, stats } = parseCalendar(feed, { ...opts, match: "WORK" });
    expect(shifts.map((s) => s.key)).toEqual(["W"]);
    expect(stats.filtered).toBe(1);
  });

  it("drops shifts outside the window", () => {
    const feed = ics([
      zoned("OLD", "Australia/Darwin", "20260101T090000", "20260101T130000"),
      zoned("IN", "Australia/Darwin", "20260820T090000", "20260820T130000"),
    ]);
    const { shifts, stats } = parseCalendar(feed, { ...opts, from: "2026-06-01" });
    expect(shifts.map((s) => s.key)).toEqual(["IN"]);
    expect(stats.outsideWindow).toBe(1);
  });

  it("reads a moved instance of a repeating event under its own key", () => {
    const feed = ics([zoned("R", "Australia/Darwin", "20260820T090000", "20260820T130000", ["RECURRENCE-ID;TZID=Australia/Darwin:20260819T090000"])]);
    expect(parseCalendar(feed, opts).shifts[0].key).toBe("R#20260819T090000");
  });

  it("ignores properties inside an alarm and unfolds long lines", () => {
    const feed = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:AL",
      "DTSTART;TZID=Australia/Dar",
      " win:20260820T090000",
      "DTEND;TZID=Australia/Darwin:20260820T130000",
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "DTSTART:20250101T000000Z",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseCalendar(feed, opts).shifts).toEqual([{ key: "AL", date: "2026-08-20", start: "09:00", end: "13:00", hours: 4 }]);
  });

  it("reads an event in an unknown zone in the calendar's zone and says so", () => {
    const feed = ics(
      [zoned("W", "AUS Eastern Standard Time", "20260820T090000", "20260820T130000")],
      ["X-WR-TIMEZONE:Australia/Sydney"],
    );
    const { shifts, stats } = parseCalendar(feed, opts);
    expect(shifts[0]).toMatchObject({ date: "2026-08-20", start: "09:00" });
    expect(stats.unknownZone).toBe(2);
  });

  it("keeps one shift when a feed repeats a UID", () => {
    const feed = ics([
      zoned("X", "Australia/Darwin", "20260820T090000", "20260820T130000"),
      zoned("X", "Australia/Darwin", "20260820T090000", "20260820T140000"),
    ]);
    const { shifts } = parseCalendar(feed, opts);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].hours).toBe(5);
  });

  it("returns shifts in date order", () => {
    const feed = ics([
      zoned("B", "Australia/Darwin", "20260822T090000", "20260822T130000"),
      zoned("A", "Australia/Darwin", "20260820T090000", "20260820T130000"),
    ]);
    expect(parseCalendar(feed, opts).shifts.map((s) => s.key)).toEqual(["A", "B"]);
  });

  it("returns nothing for an empty or broken feed", () => {
    expect(parseCalendar("", opts).shifts).toEqual([]);
    expect(parseCalendar("not a calendar", opts).stats.events).toBe(0);
  });
});

describe("syncWindow", () => {
  it("covers two weeks back and ninety days ahead", () => {
    expect(syncWindow("2026-10-28")).toEqual({ from: "2026-10-14", to: "2027-01-26" });
  });
});
