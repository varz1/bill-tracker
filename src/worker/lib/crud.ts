import { Hono, type Context } from "hono";
import type { z } from "zod";
import { newId } from "../../shared/id";
import { createStore } from "./store";

type AppEnv = { Bindings: Env };

interface Meta {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface CrudOptions<T extends Meta, I, P> {
  /** KV key prefix, e.g. "bill". */
  prefix: string;
  schema: z.ZodType<T>;
  inputSchema: z.ZodType<I>;
  patchSchema: z.ZodType<P>;
  /** Turns a validated request body into a full record. */
  create(input: I, meta: Meta): T;
}

/** Reads and validates a JSON body. Returns a 400 response on failure. */
export async function readBody<S>(c: Context, schema: z.ZodType<S>): Promise<S | Response> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  return parsed.data;
}

/** GET /, GET /:id, POST /, PATCH /:id, DELETE /:id over one KV-backed record type. */
export function crudRoutes<T extends Meta, I, P extends object>(opts: CrudOptions<T, I, P>) {
  const app = new Hono<AppEnv>();
  const store = (c: Context<AppEnv>) => createStore(c.env.BILL_DATA, opts.prefix, opts.schema);

  app.get("/", async (c) => c.json({ items: await store(c).list() }));

  app.get("/:id", async (c) => {
    const item = await store(c).get(c.req.param("id"));
    return item ? c.json({ item }) : c.json({ error: "not_found" }, 404);
  });

  app.post("/", async (c) => {
    const body = await readBody(c, opts.inputSchema);
    if (body instanceof Response) return body;
    const now = new Date().toISOString();
    const item = opts.create(body, { id: newId(), createdAt: now, updatedAt: now });
    await store(c).put(item);
    return c.json({ item }, 201);
  });

  app.patch("/:id", async (c) => {
    const body = await readBody(c, opts.patchSchema);
    if (body instanceof Response) return body;
    const existing = await store(c).get(c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const merged = opts.schema.safeParse({
      ...existing,
      ...body,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    if (!merged.success) return c.json({ error: "invalid_body", issues: merged.error.issues }, 400);
    await store(c).put(merged.data);
    return c.json({ item: merged.data });
  });

  app.delete("/:id", async (c) => {
    await store(c).remove(c.req.param("id"));
    return c.body(null, 204);
  });

  return app;
}
