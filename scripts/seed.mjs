#!/usr/bin/env node
// Fills a running instance with made-up demo data through its public API.
//
//   npm run seed                        # http://localhost:5173
//   npm run seed -- https://my-app.workers.dev
//   npm run seed -- <url> --force       # add even if the instance already has data
//
// All dates are relative to today so the timeline always has something to show.

const args = process.argv.slice(2);
const force = args.includes("--force");
const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:5173").replace(/\/$/, "");

const DAY = 86_400_000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const isoMonthsAgo = (months, day) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months, day);
  return d.toISOString().slice(0, 10);
};

// Money is in cents.
const bills = [
  { name: "Rent", amount: 92000, cycle: "weekly", startDate: iso(-40 + 3), totalPayments: null },
  { name: "Phone plan", amount: 4900, cycle: "monthly", startDate: isoMonthsAgo(5, 8), totalPayments: null },
  { name: "Streaming", amount: 1699, cycle: "monthly", startDate: isoMonthsAgo(11, 21), totalPayments: null },
  { name: "Gym", amount: 2250, cycle: "biweekly", startDate: iso(-30 + 5), totalPayments: null },
  { name: "Car loan", amount: 38500, cycle: "monthly", startDate: isoMonthsAgo(8, 27), totalPayments: 36 },
  { name: "Contents insurance", amount: 31200, cycle: "quarterly", startDate: isoMonthsAgo(2, 12), totalPayments: null },
  { name: "Domain renewal", amount: 2400, cycle: "yearly", startDate: isoMonthsAgo(3, 15), totalPayments: null },
  { name: "Laptop instalments", amount: 11900, cycle: "monthly", startDate: isoMonthsAgo(10, 4), totalPayments: 12 },
];

const employers = ["Harbour Cafe", "Northside Books"];
const shifts = [];
for (let i = 21; i >= 1; i--) {
  const dow = new Date(Date.now() - i * DAY).getUTCDay();
  if (dow === 0 || dow === 3) continue; // days off
  const cafe = dow !== 6;
  shifts.push({
    date: iso(-i),
    employer: cafe ? employers[0] : employers[1],
    hours: cafe ? 6.5 : 5,
    start: cafe ? "07:00" : "10:00",
    end: cafe ? "13:30" : "15:00",
  });
}

const income = [];
for (let w = 6; w >= 1; w--) {
  const gross = 52000 + ((w * 3719) % 9000); // 520.00 - 610.00
  const tax = Math.round(gross * 0.17);
  income.push({
    employer: employers[0],
    payDate: iso(-w * 7),
    periodStart: iso(-w * 7 - 9),
    periodEnd: iso(-w * 7 - 3),
    gross,
    tax,
    net: gross - tax,
    super: Math.round(gross * 0.12),
  });
}

async function call(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  });
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
  const nextRent = [0, 1, 2, 3, 4, 5, 6].map((n) => iso(-37 + 7 * n)).find((d) => d >= iso(0));
  await call(`/api/bills/${rent.id}`, { method: "PATCH", body: JSON.stringify({ paidAhead: [nextRent] }) });

  for (const shift of shifts) await post("/api/shifts", shift);
  for (const slip of income) await post("/api/income", slip);

  console.log(`Seeded ${bills.length} bills, ${shifts.length} shifts and ${income.length} payslips into ${base}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
