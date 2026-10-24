import { describe, expect, it } from "vitest";
import { formatMoney, toMinor } from "../src/shared/money";

describe("money", () => {
  it("converts major units to integer minor units without float drift", () => {
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });

  it("formats minor units in the given currency", () => {
    expect(formatMoney(123456, "AUD", "en-AU")).toBe("$1,234.56");
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
  });
});
