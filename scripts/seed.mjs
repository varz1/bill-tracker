#!/usr/bin/env node
// Fills a running instance with made-up demo data through its public API.
//
//   npm run seed                        # http://localhost:5173
//   npm run seed -- https://my-app.workers.dev
//   npm run seed -- <url> --force       # add even if the instance already has data
//
// The pay data models a full-time supermarket employee: usually five paid 7.6-hour shifts a week (38 hours),
// weekend penalty rates, weekly pay on the Wednesday after each Monday-Sunday period, Australian
// tax withholding estimated from the resident rates, and 12% super. Everything is relative to today
// so the charts and timeline always have something to show.

const args = process.argv.slice(2);
const force = args.includes("--force");
const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:5173").replace(/\/$/, "");

const EMPLOYER = "Greenfield Supermarket";
const HOURLY_RATE = 31.0; // dollars
const PAID_HOURS = 7.6; // per shift, after a 30-minute unpaid break
const WEEKS_OF_HISTORY = 14;
const SUPER_RATE = 0.12;

// ---- date helpers (local calendar dates, matching what the app shows as "today") ----

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const addMonths = (d, n, day) => {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
};

const today = new Date();
today.setHours(0, 0, 0, 0);
const thisMonday = addDays(today, -((today.getDay() + 6) % 7));
const iso = (offsetDays) => ymd(addDays(today, offsetDays));
const isoMonthsAgo = (months, day) => ymd(addMonths(today, -months, day));

// ---- bills (amounts in cents) ----

const bills = [
  { name: "Rent", amount: 38000, cycle: "weekly", startDate: iso(-37), totalPayments: null },
  { name: "Phone plan", amount: 4900, cycle: "monthly", startDate: isoMonthsAgo(5, 8), totalPayments: null },
  { name: "Streaming", amount: 1699, cycle: "monthly", startDate: isoMonthsAgo(11, 21), totalPayments: null },
  { name: "Gym", amount: 2250, cycle: "biweekly", startDate: iso(-25), totalPayments: null },
  { name: "Car loan", amount: 38500, cycle: "monthly", startDate: isoMonthsAgo(8, 27), totalPayments: 36 },
  { name: "Contents insurance", amount: 31200, cycle: "quarterly", startDate: isoMonthsAgo(2, 12), totalPayments: null },
  { name: "Domain renewal", amount: 2400, cycle: "yearly", startDate: isoMonthsAgo(3, 15), totalPayments: null },
  { name: "Laptop instalments", amount: 11900, cycle: "monthly", startDate: isoMonthsAgo(10, 4), totalPayments: 12 },
];

// ---- shifts and payslips ----

// Two alternating rosters; each number is a weekday offset from Monday.
const ROSTERS = [
  [0, 1, 3, 4, 5], // Mon Tue Thu Fri Sat
  [1, 2, 4, 5, 6], // Tue Wed Fri Sat Sun
];
const START_TIMES = ["06:00", "07:00", "13:00", "14:00", "06:00"];
const PENALTY = { 6: 1.25, 0: 1.5 }; // Saturday, Sunday (Date#getDay values)

function endTime(start) {
  // 8h06m on site = 7.6 paid hours + a 30-minute break
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + 8 * 60 + 6;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/** Shifts for the week starting at `monday`: the API body plus the pay it earns in dollars. */
function shiftsForWeek(monday, weekIndex) {
  const roster = [...ROSTERS[weekIndex % 2]];
  // Now and then a day off, or an extra shift on a day that's normally free, so hours aren't a flat 38.
  if (weekIndex % 7 === 3) roster.pop();
  if (weekIndex % 7 === 5) roster.unshift(roster.includes(2) ? 0 : 2);
  return roster.map((offset, i) => {
    const date = addDays(monday, offset);
    const start = START_TIMES[(weekIndex + i) % START_TIMES.length];
    return {
      body: { date: ymd(date), employer: EMPLOYER, hours: PAID_HOURS, start, end: endTime(start) },
      pay: PAID_HOURS * HOURLY_RATE * (PENALTY[date.getDay()] ?? 1),
    };
  });
}

/** Weekly withholding estimate for a resident, in whole dollars (income tax plus 2% Medicare). */
function weeklyTax(weeklyGross) {
  const annual = weeklyGross * 52;
  const incomeTax = annual <= 18200 ? 0 : annual <= 45000 ? (annual - 18200) * 0.16 : 4288 + (annual - 45000) * 0.3;
  return Math.round((incomeTax + annual * 0.02) / 52);
}

const shifts = [];
const payslips = [];
// From the oldest week to next week's roster, which is still in the future.
for (let k = WEEKS_OF_HISTORY; k >= -1; k--) {
  const monday = addDays(thisMonday, -7 * k);
  const weekShifts = shiftsForWeek(monday, k + 1);
  shifts.push(...weekShifts.map((s) => s.body));

  const periodEnd = addDays(monday, 6);
  const payDate = addDays(periodEnd, 3); // the Wednesday after
  // The current and future weeks aren't paid yet, and neither is last week until its pay day arrives.
  if (k < 1 || payDate > today) continue;

  const gross = Math.round(weekShifts.reduce((sum, s) => sum + s.pay, 0) * 100); // cents
  const tax = weeklyTax(gross / 100) * 100;
  payslips.push({
    employer: EMPLOYER,
    payDate: ymd(payDate),
    periodStart: ymd(monday),
    periodEnd: ymd(periodEnd),
    gross,
    tax,
    net: gross - tax,
    super: Math.round(gross * SUPER_RATE),
  });
}

// ---- upload ----

async function call(path, init) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json" } });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const post = async (path, body) => (await call(path, { method: "POST", body: JSON.stringify(body) })).item;

try {
  const existing = await Promise.all(["bills", "shifts", "income"].map((r) => call(`/api/${r}`)));
  const count = existing.reduce((n, r) => n + r.items.length, 0);
  if (count > 0 && !force) {
    console.error(`${base} already has ${count} records. Re-run with --force to add demo data anyway.`);
    process.exit(1);
  }

  const created = [];
  for (const bill of bills) created.push(await post("/api/bills", bill));
  // Mark the next upcoming Rent payment as paid early so the "paid" state shows up.
  const rent = created[0];
  const rentStart = new Date(`${bills[0].startDate}T00:00:00`);
  const nextRent = [...Array(60).keys()].map((n) => ymd(addDays(rentStart, 7 * n))).find((d) => d >= ymd(today));
  await call(`/api/bills/${rent.id}`, { method: "PATCH", body: JSON.stringify({ paidAhead: [nextRent] }) });

  for (const shift of shifts) await post("/api/shifts", shift);
  for (const slip of payslips) await post("/api/income", slip);

  console.log(`Seeded ${bills.length} bills, ${shifts.length} shifts and ${payslips.length} payslips into ${base}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
