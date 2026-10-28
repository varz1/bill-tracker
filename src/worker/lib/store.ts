import type { z } from "zod";

// One KV key per record: `${prefix}:${id}`. Ids are ULIDs, so listing returns records oldest-first.
// Reads use KV's bulk get (up to 100 keys per call, billed as a single request),
// which keeps a full listing well inside the Workers subrequest limit.

const BULK_GET_LIMIT = 100;

export interface Store<T extends { id: string }> {
  /** Every record, or only those whose id starts with `idPrefix`. */
  list(idPrefix?: string): Promise<T[]>;
  get(id: string): Promise<T | null>;
  put(record: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export function createStore<T extends { id: string }>(
  kv: KVNamespace,
  prefix: string,
  schema: z.ZodType<T>,
): Store<T> {
  const keyOf = (id: string) => `${prefix}:${id}`;

  async function listKeys(idPrefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await kv.list({ prefix: `${prefix}:${idPrefix}`, cursor });
      keys.push(...page.keys.map((k) => k.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return keys;
  }

  return {
    async list(idPrefix = "") {
      const keys = await listKeys(idPrefix);
      const records: T[] = [];
      for (let i = 0; i < keys.length; i += BULK_GET_LIMIT) {
        const values = await kv.get<unknown>(keys.slice(i, i + BULK_GET_LIMIT), "json");
        for (const value of values.values()) {
          const parsed = schema.safeParse(value);
          if (parsed.success) records.push(parsed.data);
        }
      }
      return records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },

    async get(id) {
      const value = await kv.get<unknown>(keyOf(id), "json");
      const parsed = schema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },

    async put(record) {
      await kv.put(keyOf(record.id), JSON.stringify(record));
    },

    async remove(id) {
      await kv.delete(keyOf(id));
    },
  };
}
