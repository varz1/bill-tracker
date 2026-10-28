import { describe, expect, it } from "vitest";
import {
  BillInputSchema,
  BillPatchSchema,
  EmployerInputSchema,
  EmployerSchema,
  SettingsPatchSchema,
  ShiftInputSchema,
} from "../src/shared/schemas";

describe("BillInputSchema", () => {
  const valid = { name: "Rent", amount: 42400, cycle: "biweekly", startDate: "2026-07-01", totalPayments: null };

  it("accepts a bill without paidAhead", () => {
    expect(BillInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects fractional or negative amounts", () => {
    expect(BillInputSchema.safeParse({ ...valid, amount: 19.99 }).success).toBe(false);
    expect(BillInputSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });

  it("rejects an unknown cycle and an impossible date", () => {
    expect(BillInputSchema.safeParse({ ...valid, cycle: "daily" }).success).toBe(false);
    expect(BillInputSchema.safeParse({ ...valid, startDate: "2026-02-30" }).success).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(BillInputSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("patch accepts a subset and leaves other fields absent", () => {
    const parsed = BillPatchSchema.parse({ amount: 100 });
    expect(parsed).toEqual({ amount: 100 });
  });
});

describe("ShiftInputSchema", () => {
  it("does not let the client choose the source", () => {
    const parsed = ShiftInputSchema.parse({ date: "2026-05-05", employerId: "E1", hours: 4, source: "calendar" });
    expect(parsed).not.toHaveProperty("source");
  });

  it("validates HH:mm times and hour range", () => {
    const base = { date: "2026-05-05", employerId: "E1", hours: 4 };
    expect(ShiftInputSchema.safeParse({ ...base, start: "09:00", end: "13:00" }).success).toBe(true);
    expect(ShiftInputSchema.safeParse({ ...base, start: "9:00" }).success).toBe(false);
    expect(ShiftInputSchema.safeParse({ ...base, hours: 0 }).success).toBe(false);
    expect(ShiftInputSchema.safeParse({ ...base, hours: 25 }).success).toBe(false);
  });
});

describe("SettingsPatchSchema", () => {
  it("requires an uppercase 3-letter currency code", () => {
    expect(SettingsPatchSchema.safeParse({ currency: "USD" }).success).toBe(true);
    expect(SettingsPatchSchema.safeParse({ currency: "usd" }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ weekStartsOn: 2 }).success).toBe(false);
  });
});

describe("Employer break settings", () => {
  const base = { name: "Cafe", contract: "casual", sync: "calendar" };

  it("are optional on create and on stored employers", () => {
    expect(EmployerInputSchema.safeParse(base).success).toBe(true);
    const stored = { ...base, id: "E1", color: "#2a78d6", createdAt: "2026-10-28T00:00:00.000Z", updatedAt: "2026-10-28T00:00:00.000Z" };
    expect(EmployerSchema.safeParse(stored).success).toBe(true);
  });

  it("accept a known rule and break length", () => {
    expect(EmployerInputSchema.safeParse({ ...base, breakRule: "over5_twice10", breakMinutes: 45 }).success).toBe(true);
  });

  it("reject an unknown rule or a break length that is not offered", () => {
    expect(EmployerInputSchema.safeParse({ ...base, breakRule: "over7" }).success).toBe(false);
    expect(EmployerInputSchema.safeParse({ ...base, breakMinutes: 50 }).success).toBe(false);
  });
});
