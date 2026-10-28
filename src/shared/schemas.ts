import { z } from "zod";
import { BREAK_RULES } from "./breaks";
import { isValidIsoDate } from "./dates";
import { isValidZone } from "./timezone";
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

// ---- Employers -------------------------------------------------------------

export const CONTRACTS = ["full-time", "part-time", "casual"] as const;
/** How an employer's shifts get into the app. "calendar" is reserved for the planned calendar sync. */
export const SYNC_MODES = ["manual", "calendar"] as const;

export const EmployerSchema = z.object({
  ...meta,
  name: text,
  contract: z.enum(CONTRACTS),
  sync: z.enum(SYNC_MODES),
  /** Chart colour. The server picks a free palette colour when none is given on creation. */
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Which unpaid meal break calendar sync takes off an event's length. Absent means none. */
  breakRule: z.enum(BREAK_RULES).optional(),
  breakMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]).optional(),
});
export const EmployerInputSchema = EmployerSchema.pick({
  name: true,
  contract: true,
  sync: true,
  color: true,
  breakRule: true,
  breakMinutes: true,
}).partial({ color: true });
export const EmployerPatchSchema = EmployerInputSchema.partial();
export type Employer = z.infer<typeof EmployerSchema>;
export type EmployerInput = z.infer<typeof EmployerInputSchema>;

// ---- Shifts ----------------------------------------------------------------

export const ShiftSchema = z.object({
  ...meta,
  date: isoDate,
  employerId: z.string().min(1).max(64),
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
  employerId: z.string().min(1).max(64),
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
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  /** IANA zone used for "today" in calendar sync, and for calendars that don't name a zone of their own. */
  timeZone: z.string().refine(isValidZone, "Expected an IANA time zone such as Australia/Sydney"),
});
export const SettingsPatchSchema = SettingsSchema.partial();
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  currency: "AUD",
  weekStartsOn: 1,
  timeZone: "Australia/Sydney",
};

// ---- Calendar sync ---------------------------------------------------------

export const CalendarLinkInputSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  /** Only events whose title contains this text become shifts. */
  match: z.string().trim().max(100).optional(),
});
export type CalendarLinkInput = z.infer<typeof CalendarLinkInputSchema>;

/** What is stored under `calsrc:<employerId>`. The url is a secret and never leaves the Worker unmasked. */
export const CalendarSourceSchema = z.object({
  url: z.string(),
  match: z.string().optional(),
});
export type CalendarSource = z.infer<typeof CalendarSourceSchema>;

/** What is stored under `calstate:<employerId>`: how the last syncs went, plus what is needed to skip needless work. */
export const CalendarStateSchema = z.object({
  /** Set while a sync runs, so a second trigger doesn't start another one. */
  startedAt: z.iso.datetime().optional(),
  lastAttemptAt: z.iso.datetime().optional(),
  lastSuccessAt: z.iso.datetime().optional(),
  /** A short code such as "timeout", "http_404" or "empty_calendar"; cleared by the next success. */
  lastError: z.string().optional(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  /** Fingerprints of the settings and the feed the last full sync used. */
  configSig: z.string().optional(),
  bodySig: z.string().optional(),
  zone: z.object({ name: z.string(), source: z.enum(["calendar", "events", "fallback"]) }).optional(),
  result: z
    .object({
      created: z.number(),
      updated: z.number(),
      deleted: z.number(),
      unchanged: z.number(),
      /** Events that were not shifts: all-day, cancelled, filtered out or unreadable. */
      skipped: z.number(),
      /** Repeating events, which are not expanded. */
      recurring: z.number(),
    })
    .optional(),
});
export type CalendarState = z.infer<typeof CalendarStateSchema>;

/** What the API tells the page about an employer's calendar link. */
export interface CalendarStatus {
  linked: boolean;
  /** Masked; the real link is never returned. */
  url?: string;
  match?: string;
  syncing: boolean;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  zone?: CalendarState["zone"];
  result?: CalendarState["result"];
}
