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
import { loadSource } from "../lib/calendarSync";
import { crudRoutes } from "../lib/crud";
import { deleteEmployerData } from "../lib/employerData";
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
    return { ...input, color: input.color ?? nextEmployerColor(existing.map((e) => e.color)), ...meta };
  },
  check: async (c, record) => {
    const existing = await employerStore(c.env).list();
    if (existing.some((e) => e.id !== record.id && sameName(e.name, record.name))) {
      return c.json({ error: "duplicate_name" }, 409);
    }
    // The calendar link is managed through /api/employers/:id/calendar, so `sync` can't drift from it.
    const linked = (await loadSource(c.env.BILL_DATA, record.id)) !== null;
    if (record.sync === "calendar" && !linked) return c.json({ error: "no_calendar" }, 400);
    if (record.sync !== "calendar" && linked) return c.json({ error: "calendar_linked" }, 409);
    return null;
  },
  beforeDelete: async (c, id) => {
    // ?cascade=all deletes the employer together with its calendar link, shifts and payslips.
    if (c.req.query("cascade") === "all") {
      return (await deleteEmployerData(c.env, id)) ? null : c.json({ error: "sync_running" }, 409);
    }
    if (await loadSource(c.env.BILL_DATA, id)) return c.json({ error: "calendar_linked" }, 409);
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
  // Calendar shifts follow the calendar: change them there, or unlink the calendar to take them over.
  guard: async (c, existing) => (existing.source === "calendar" ? c.json({ error: "calendar_managed" }, 403) : null),
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
