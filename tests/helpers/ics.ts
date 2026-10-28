/** Builds a small .ics feed for tests. Each event is a list of "NAME:value" lines. */
export function ics(events: string[][], header: string[] = []): string {
  const body = events.map((lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...header, ...body, "END:VCALENDAR", ""].join("\r\n");
}

/** A timed event in a named time zone. `start` and `end` look like 20260820T083000. */
export function zoned(uid: string, tz: string, start: string, end: string, extra: string[] = []): string[] {
  return [`UID:${uid}`, `DTSTART;TZID=${tz}:${start}`, `DTEND;TZID=${tz}:${end}`, ...extra];
}
