import { describe, expect, it } from "vitest";
import { EMPLOYER_COLORS, nextEmployerColor, sameName } from "../src/shared/employers";

describe("nextEmployerColor", () => {
  it("hands out palette colours in order, skipping ones already used", () => {
    expect(nextEmployerColor([])).toBe(EMPLOYER_COLORS[0]);
    expect(nextEmployerColor([EMPLOYER_COLORS[0]])).toBe(EMPLOYER_COLORS[1]);
    expect(nextEmployerColor([EMPLOYER_COLORS[1]])).toBe(EMPLOYER_COLORS[0]);
  });

  it("matches used colours ignoring case", () => {
    expect(nextEmployerColor([EMPLOYER_COLORS[0].toUpperCase()])).toBe(EMPLOYER_COLORS[1]);
  });

  it("starts repeating once every colour is taken", () => {
    expect(nextEmployerColor(EMPLOYER_COLORS)).toBe(EMPLOYER_COLORS[0]);
  });
});

describe("sameName", () => {
  it("ignores case and surrounding spaces", () => {
    expect(sameName(" Cafe ", "cafe")).toBe(true);
    expect(sameName("Cafe", "Cafe 2")).toBe(false);
  });
});
