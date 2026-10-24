import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { CYCLES } from "./schedule";

const isoDate = z.string().refine(isValidIsoDate, "Expected a valid date as YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
const text = z.string().trim().min(1).max(100);
// Money is an integer count of minor units (cents).
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const meta = {
  id: z.string().min(1).max(64),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
const omitMeta = { id: true, createdAt: true, updatedAt: true } as const;

// ---- Bills -----------------------------------------------------------------

export const BillSchema = z.object({
  ...meta,
  name: text,
  amount: money,
  cycle: z.enum(CYCLES),
  startDate: isoDate,
  /** Number of payments; null for an open-ended bill. */
  totalPayments: z.number().int().min(1).max(1200).nullable(),
  /** Due dates already paid early. */
  paidAhead: z.array(isoDate).max(1200),
});
export const BillInputSchema = BillSchema.omit(omitMeta).partial({ paidAhead: true });
export const BillPatchSchema = BillInputSchema.partial();
export type Bill = z.infer<typeof BillSchema>;
export type BillInput = z.infer<typeof BillInputSchema>;

// ---- Shifts ----------------------------------------------------------------

export const ShiftSchema = z.object({
  ...meta,
  date: isoDate,
  employer: text,
  hours: z.number().positive().max(24),
  start: time.optional(),
  end: time.optional(),
  /** "calendar" shifts are owned by the calendar sync; "manual" ones are never touched by it. */
  source: z.enum(["manual", "calendar"]),
  calendarUid: z.string().max(256).optional(),
});
export const ShiftInputSchema = ShiftSchema.omit({ ...omitMeta, source: true, calendarUid: true });
export const ShiftPatchSchema = ShiftInputSchema.partial();
export type Shift = z.infer<typeof ShiftSchema>;
export type ShiftInput = z.infer<typeof ShiftInputSchema>;

// ---- Income (one record per payslip) ---------------------------------------

export const IncomeSchema = z.object({
  ...meta,
  employer: text,
  payDate: isoDate,
  periodStart: isoDate,
  periodEnd: isoDate,
  gross: money,
  tax: money,
  net: money,
  super: money,
});
export const IncomeInputSchema = IncomeSchema.omit(omitMeta);
export const IncomePatchSchema = IncomeInputSchema.partial();
export type Income = z.infer<typeof IncomeSchema>;
export type IncomeInput = z.infer<typeof IncomeInputSchema>;

// ---- Settings (a single record) --------------------------------------------

export const SettingsSchema = z.object({
  /** ISO 4217 code. The app supports exactly one currency; there is no conversion. */
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** BCP 47 locale used for number and date formatting. */
  locale: z.string().min(2).max(35),
  /** IANA time zone used to decide what "today" is. */
  timeZone: z.string().min(1).max(64),
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
});
export const SettingsPatchSchema = SettingsSchema.partial();
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  currency: "AUD",
  locale: "en-AU",
  timeZone: "UTC",
  weekStartsOn: 1,
};
