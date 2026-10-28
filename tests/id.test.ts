import { describe, expect, it } from "vitest";
import { newId, stableId } from "../src/shared/id";

describe("stableId", () => {
  it("is the same for the same input and differs otherwise", () => {
    expect(stableId("a")).toBe(stableId("a"));
    expect(stableId("a")).not.toBe(stableId("b"));
    expect(stableId("ab\nc")).not.toBe(stableId("a\nbc"));
  });

  it("has a fixed length and no collisions across many inputs", () => {
    const ids = new Set(Array.from({ length: 5000 }, (_, i) => stableId(`E1\nuid-${i}`)));
    expect(ids.size).toBe(5000);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{22}$/);
  });
});

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
