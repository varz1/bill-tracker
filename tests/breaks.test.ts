import { describe, expect, it } from "vitest";
import { BREAK_RULES, paidMinutes, unpaidMinutes, type BreakRule } from "../src/shared/breaks";

const h = (hours: number) => Math.round(hours * 60);

describe("unpaidMinutes", () => {
  it("takes nothing under 'none'", () => {
    expect(unpaidMinutes(h(12), "none")).toBe(0);
  });

  it("'over 5 h' needs more than five hours", () => {
    expect(unpaidMinutes(h(5), "over5")).toBe(0);
    expect(unpaidMinutes(h(5) + 1, "over5")).toBe(30);
    expect(unpaidMinutes(h(12), "over5")).toBe(30);
  });

  it("'5 h or more' counts exactly five hours", () => {
    expect(unpaidMinutes(h(5) - 1, "atLeast5")).toBe(0);
    expect(unpaidMinutes(h(5), "atLeast5")).toBe(30);
  });

  it("'over 6 h' and 'over 4.5 h' use their own thresholds", () => {
    expect(unpaidMinutes(h(6), "over6")).toBe(0);
    expect(unpaidMinutes(h(6) + 1, "over6")).toBe(30);
    expect(unpaidMinutes(h(4.5), "over4_5")).toBe(0);
    expect(unpaidMinutes(h(4.5) + 1, "over4_5")).toBe(30);
  });

  it("retail takes a second break from ten hours, counting exactly ten", () => {
    expect(unpaidMinutes(h(5), "over5_twice10")).toBe(0);
    expect(unpaidMinutes(h(9) + 59, "over5_twice10")).toBe(30);
    expect(unpaidMinutes(h(10), "over5_twice10")).toBe(60);
  });

  it("scales with the chosen break length", () => {
    expect(unpaidMinutes(h(8), "over5", 45)).toBe(45);
    expect(unpaidMinutes(h(10), "over5_twice10", 45)).toBe(90);
    expect(unpaidMinutes(h(10), "over5_twice10", 60)).toBe(120);
  });

  it("defaults to 30 minutes", () => {
    expect(unpaidMinutes(h(8), "over5")).toBe(30);
  });

  it("every rule is defined", () => {
    for (const rule of BREAK_RULES as readonly BreakRule[]) expect(() => unpaidMinutes(h(8), rule)).not.toThrow();
  });
});

describe("paidMinutes", () => {
  it("is the span minus the unpaid break", () => {
    expect(paidMinutes(h(9.25), "over5")).toBe(525);
    expect(paidMinutes(h(4), "over5")).toBe(240);
  });
});
