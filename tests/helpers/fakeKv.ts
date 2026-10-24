/** In-memory stand-in for the parts of KVNamespace the app uses. */
export class FakeKV {
  readonly data = new Map<string, string>();
  /** Number of keys requested by each bulk get, to assert the 100-key limit is respected. */
  readonly bulkSizes: number[] = [];

  constructor(private readonly pageSize = 3) {}

  async get(key: string | string[], _type?: string): Promise<unknown> {
    if (Array.isArray(key)) {
      this.bulkSizes.push(key.length);
      if (key.length > 100) throw new Error("bulk get supports at most 100 keys");
      return new Map(key.map((k) => [k, this.parse(this.data.get(k))]));
    }
    return this.parse(this.data.get(key));
  }

  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(opts: { prefix?: string; cursor?: string } = {}) {
    const names = [...this.data.keys()].filter((k) => k.startsWith(opts.prefix ?? "")).sort();
    const start = opts.cursor ? names.indexOf(opts.cursor) + 1 : 0;
    const page = names.slice(start, start + this.pageSize);
    const complete = start + this.pageSize >= names.length;
    return {
      keys: page.map((name) => ({ name })),
      list_complete: complete,
      cursor: complete ? undefined : page[page.length - 1],
    };
  }

  private parse(raw: string | undefined): unknown {
    return raw === undefined ? null : JSON.parse(raw);
  }
}

export const asEnv = (kv: FakeKV) => ({ BILL_DATA: kv }) as unknown as Env;
