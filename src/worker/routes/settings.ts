import { Hono } from "hono";
import { DEFAULT_SETTINGS, SettingsPatchSchema, SettingsSchema, type Settings } from "../../shared/schemas";
import { readBody } from "../lib/crud";

const KEY = "settings";

export async function loadSettings(kv: KVNamespace): Promise<Settings> {
  const stored = await kv.get<unknown>(KEY, "json");
  const parsed = SettingsSchema.partial().safeParse(stored ?? {});
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export const settings = new Hono<{ Bindings: Env }>();

settings.get("/", async (c) => c.json({ settings: await loadSettings(c.env.BILL_DATA) }));

settings.patch("/", async (c) => {
  const body = await readBody(c, SettingsPatchSchema);
  if (body instanceof Response) return body;
  const next = { ...(await loadSettings(c.env.BILL_DATA)), ...body };
  await c.env.BILL_DATA.put(KEY, JSON.stringify(next));
  return c.json({ settings: next });
});
