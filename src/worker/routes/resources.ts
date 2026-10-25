import { nextEmployerColor, sameName } from "../../shared/employers";
import {
  BillInputSchema,
  BillPatchSchema,
  BillSchema,
  EmployerInputSchema,
  EmployerPatchSchema,
  EmployerSchema,
  IncomeInputSchema,
  IncomePatchSchema,
  IncomeSchema,
  ShiftInputSchema,
  ShiftPatchSchema,
  ShiftSchema,
} from "../../shared/schemas";
import { crudRoutes } from "../lib/crud";
import { createStore } from "../lib/store";

export const bills = crudRoutes({
  prefix: "bill",
  schema: BillSchema,
  inputSchema: BillInputSchema,
  patchSchema: BillPatchSchema,
  create: (input, meta) => ({ ...input, paidAhead: input.paidAhead ?? [], ...meta }),
});

const employerStore = (env: Env) => createStore(env.BILL_DATA, "employer", EmployerSchema);

export const employers = crudRoutes({
  prefix: "employer",
  schema: EmployerSchema,
  inputSchema: EmployerInputSchema,
  patchSchema: EmployerPatchSchema,
  create: async (input, meta, c) => {
    const existing = await employerStore(c.env).list();
    return { ...input, color: nextEmployerColor(existing.map((e) => e.color)), ...meta };
  },
  check: async (c, record) => {
    const existing = await employerStore(c.env).list();
    if (existing.some((e) => e.id !== record.id && sameName(e.name, record.name))) {
      return c.json({ error: "duplicate_name" }, 409);
    }
    return null;
  },
  beforeDelete: async (c, id) => {
    const [shiftList, slipList] = await Promise.all([
      createStore(c.env.BILL_DATA, "shift", ShiftSchema).list(),
      createStore(c.env.BILL_DATA, "income", IncomeSchema).list(),
    ]);
    const shiftCount = shiftList.filter((s) => s.employerId === id).length;
    const payslipCount = slipList.filter((p) => p.employerId === id).length;
    if (shiftCount + payslipCount > 0) return c.json({ error: "employer_in_use", shiftCount, payslipCount }, 409);
    return null;
  },
});

export const shifts = crudRoutes({
  prefix: "shift",
  schema: ShiftSchema,
  inputSchema: ShiftInputSchema,
  patchSchema: ShiftPatchSchema,
  // Shifts created through the API are always manual; only the calendar sync writes "calendar" ones.
  create: (input, meta) => ({ ...input, source: "manual" as const, ...meta }),
  check: async (c, record) =>
    (await employerStore(c.env).get(record.employerId)) ? null : c.json({ error: "unknown_employer" }, 400),
});

export const income = crudRoutes({
  prefix: "income",
  schema: IncomeSchema,
  inputSchema: IncomeInputSchema,
  patchSchema: IncomePatchSchema,
  create: (input, meta) => ({ ...input, ...meta }),
  check: async (c, record) =>
    (await employerStore(c.env).get(record.employerId)) ? null : c.json({ error: "unknown_employer" }, 400),
});
