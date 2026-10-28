import { describe, expect, it } from "vitest";
import { maskCalendarUrl, normalizeCalendarUrl } from "../src/shared/calendarUrl";

describe("normalizeCalendarUrl", () => {
  it("turns webcal:// into https://", () => {
    expect(normalizeCalendarUrl("webcal://p172-caldav.icloud.com/published/2/abc")).toBe("https://p172-caldav.icloud.com/published/2/abc");
    expect(normalizeCalendarUrl("WEBCAL://example.com/a.ics")).toBe("https://example.com/a.ics");
  });

  it("keeps an https link and trims spaces", () => {
    expect(normalizeCalendarUrl("  https://calendar.example.com/roster.ics?token=x ")).toBe("https://calendar.example.com/roster.ics?token=x");
  });

  it("refuses plain http, other schemes and junk", () => {
    expect(normalizeCalendarUrl("http://example.com/a.ics")).toBeNull();
    expect(normalizeCalendarUrl("ftp://example.com/a.ics")).toBeNull();
    expect(normalizeCalendarUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeCalendarUrl("not a url")).toBeNull();
    expect(normalizeCalendarUrl("")).toBeNull();
  });

  it("refuses logins in the link and unusual ports", () => {
    expect(normalizeCalendarUrl("https://user:pass@example.com/a.ics")).toBeNull();
    expect(normalizeCalendarUrl("https://example.com:8443/a.ics")).toBeNull();
    expect(normalizeCalendarUrl("https://example.com:443/a.ics")).toBe("https://example.com/a.ics");
  });

  it("refuses addresses and local names", () => {
    for (const host of ["127.0.0.1", "10.0.0.5", "[::1]", "localhost", "printer.local", "db.internal", "intranet"]) {
      expect(normalizeCalendarUrl(`https://${host}/a.ics`), host).toBeNull();
    }
  });

  it("refuses a very long link", () => {
    expect(normalizeCalendarUrl(`https://example.com/${"a".repeat(2000)}`)).toBeNull();
  });
});

describe("maskCalendarUrl", () => {
  it("shows the host and only the end of the path", () => {
    const masked = maskCalendarUrl("https://p172-caldav.icloud.com/published/2/Zm9vYmFyYmF6cXV4MTIzNDU2SECRET");
    expect(masked).toBe("p172-caldav.icloud.com/…CRET");
    expect(masked).not.toContain("published");
  });
});
