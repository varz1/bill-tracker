import {
  BillInputSchema,
  BillPatchSchema,
  BillSchema,
  IncomeInputSchema,
  IncomePatchSchema,
  IncomeSchema,
  ShiftInputSchema,
  ShiftPatchSchema,
  ShiftSchema,
} from "../../shared/schemas";
import { crudRoutes } from "../lib/crud";

export const bills = crudRoutes({
  prefix: "bill",
  schema: BillSchema,
  inputSchema: BillInputSchema,
  patchSchema: BillPatchSchema,
  create: (input, meta) => ({ ...input, paidAhead: input.paidAhead ?? [], ...meta }),
});

export const shifts = crudRoutes({
  prefix: "shift",
  schema: ShiftSchema,
  inputSchema: ShiftInputSchema,
  patchSchema: ShiftPatchSchema,
  // Shifts created through the API are always manual; only the calendar sync writes "calendar" ones.
  create: (input, meta) => ({ ...input, source: "manual" as const, ...meta }),
});

export const income = crudRoutes({
  prefix: "income",
  schema: IncomeSchema,
  inputSchema: IncomeInputSchema,
  patchSchema: IncomePatchSchema,
  create: (input, meta) => ({ ...input, ...meta }),
});
