import { IncomeSchema, ShiftSchema } from "../../shared/schemas";
import { inChunks, isRunning, loadSource, loadState, unlinkCalendar } from "./calendarSync";
import { createStore } from "./store";

/**
 * Deletes everything that belongs to an employer except the employer itself: its calendar link and the shifts
 * the calendar brought in, then its own shifts and payslips. Returns false, having changed nothing, while a
 * sync is running, since that sync could write shifts back. Safe to run again after a failure part-way.
 */
export async function deleteEmployerData(env: Env, employerId: string, now = new Date()): Promise<boolean> {
  const kv = env.BILL_DATA;
  const linked = (await loadSource(kv, employerId)) !== null;
  if (linked && isRunning(await loadState(kv, employerId), now)) return false;
  // Unlinking first stops any later sync from writing for this employer.
  if (linked) await unlinkCalendar(env, employerId, "delete", now);

  const shiftStore = createStore(kv, "shift", ShiftSchema);
  const slipStore = createStore(kv, "income", IncomeSchema);
  const [shifts, slips] = await Promise.all([shiftStore.list(), slipStore.list()]);
  await inChunks(
    shifts.filter((s) => s.employerId === employerId),
    (s) => shiftStore.remove(s.id),
  );
  await inChunks(
    slips.filter((p) => p.employerId === employerId),
    (p) => slipStore.remove(p.id),
  );
  return true;
}
