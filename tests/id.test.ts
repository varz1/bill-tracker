import { describe, expect, it } from "vitest";
import { newId } from "../src/shared/id";

describe("newId", () => {
  it("produces 26-char Crockford base32 ids", () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("sorts by creation time", () => {
    const ids = [1_000, 2_000, 3_000_000, 4_000_000_000_000].map((t) => newId(t));
    expect([...ids].sort()).toEqual(ids);
  });

  it("does not collide within the same millisecond", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId(1_700_000_000_000)));
    expect(ids.size).toBe(1000);
  });
});
