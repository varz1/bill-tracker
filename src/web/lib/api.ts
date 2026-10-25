import type { Bill, BillInput, Employer, EmployerInput, Income, IncomeInput, Settings, Shift, ShiftInput } from "../../shared/schemas";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface Resource<T, I> {
  list(): Promise<T[]>;
  create(input: I): Promise<T>;
  update(id: string, patch: Partial<I>): Promise<T>;
  remove(id: string): Promise<void>;
}

function resource<T, I>(base: string): Resource<T, I> {
  return {
    list: async () => (await request<{ items: T[] }>(base)).items,
    create: async (input: I) => (await request<{ item: T }>(base, { method: "POST", body: input })).item,
    update: async (id: string, patch: Partial<I>) =>
      (await request<{ item: T }>(`${base}/${id}`, { method: "PATCH", body: patch })).item,
    remove: (id: string) => request<void>(`${base}/${id}`, { method: "DELETE" }),
  };
}

export const api = {
  bills: resource<Bill, BillInput>("/api/bills"),
  employers: resource<Employer, EmployerInput>("/api/employers"),
  shifts: resource<Shift, ShiftInput>("/api/shifts"),
  income: resource<Income, IncomeInput>("/api/income"),
  settings: {
    get: async () => (await request<{ settings: Settings }>("/api/settings")).settings,
    update: async (patch: Partial<Settings>) =>
      (await request<{ settings: Settings }>("/api/settings", { method: "PATCH", body: patch })).settings,
  },
};
