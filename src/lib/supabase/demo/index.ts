/* eslint-disable @typescript-eslint/no-explicit-any -- o banco falso trabalha com linhas genéricas, como o PostgREST */
// Cliente Supabase falso do modo demonstração (só servidor).
// Estado de cada visitante = seed do dia + operações dele, guardadas compactadas
// em cookies httpOnly. Nada é gravado em banco nenhum.
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { buildSeed } from "./seed";
import {
  applyAtomic, applyOp, DbError, hojeSPFrom, randomId, runSelect,
  type Ctx, type DB, type Filter, type LoggedOp, type Op, type Row,
} from "./engine";

export const DEMO_UID_COOKIE = "demo_uid";
const OPS_COOKIE = "demo_ops";
const DAY_COOKIE = "demo_day";
const CHUNK = 3500;
const MAX_CHUNKS = 3;

type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
  delete?(name: string): unknown;
};

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 2,
};

// ---------- (de)serialização do log ----------
function encode(ops: LoggedOp[]) {
  return deflateRawSync(Buffer.from(JSON.stringify(ops))).toString("base64url");
}
function decode(raw: string): LoggedOp[] {
  try {
    return JSON.parse(inflateRawSync(Buffer.from(raw, "base64url")).toString("utf8"));
  } catch {
    return [];
  }
}
function readRaw(store: CookieStore) {
  let raw = "";
  for (let i = 0; i < MAX_CHUNKS; i++) raw += store.get(`${OPS_COOKIE}_${i}`)?.value ?? "";
  return raw;
}

// ---------- montagem do banco (com cache por conteúdo do cookie) ----------
const cache = new Map<string, DB>();

function build(day: string, raw: string): { db: DB; ops: LoggedOp[] } {
  const ops = raw ? decode(raw) : [];
  const key = `${day}|${raw}`;
  const hit = cache.get(key);
  if (hit) return { db: structuredClone(hit), ops };

  const db = buildSeed(day, new Date().toISOString());
  const valid: LoggedOp[] = [];
  for (const op of ops) {
    const ids = [...op.ids];
    const ctx: Ctx = { now: op.n, uid: op.u, newId: () => ids.shift() ?? randomId() };
    try {
      applyAtomic(db, op, ctx);
      valid.push(op);
    } catch {
      /* operação que deixou de fazer sentido (ex.: log cortado): ignora */
    }
  }
  cache.set(key, structuredClone(db));
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return { db, ops: valid };
}

// ---------- erros no formato do supabase-js ----------
function toError(e: unknown) {
  if (e instanceof DbError) return { message: e.message, code: e.code, details: null as string | null, hint: null as string | null };
  return { message: e instanceof Error ? e.message : String(e), code: "XX000", details: null, hint: null };
}

type Result = { data: any; error: ReturnType<typeof toError> | null; count?: number | null; status: number; statusText: string };
const ok = (data: any, extra: Partial<Result> = {}): Result => ({ data, error: null, status: 200, statusText: "OK", ...extra });
const fail = (e: unknown): Result => ({ data: null, error: toError(e), status: 400, statusText: "Bad Request" });

// ---------- cliente ----------
export class DemoClient {
  private day: string;
  private db: DB;
  private ops: LoggedOp[];

  private lastRaw = "";

  constructor(private store: CookieStore) {
    this.day = hojeSPFrom(new Date().toISOString());
    this.db = undefined as unknown as DB;
    this.ops = [];
    this.sync();
  }

  // Outro cliente da mesma requisição pode ter gravado no cookie: relê se mudou.
  private seenRaw: string | null = null;

  private sync() {
    const raw = this.store.get(DAY_COOKIE)?.value === this.day ? readRaw(this.store) : "";
    const mudouPorFora = raw !== this.seenRaw && raw !== this.lastRaw;
    this.seenRaw = raw;
    if (this.db && !mudouPorFora) return;
    const built = build(this.day, raw);
    this.db = built.db;
    this.ops = built.ops;
    this.lastRaw = raw;
  }

  get uid(): string | null {
    const uid = this.store.get(DEMO_UID_COOKIE)?.value ?? null;
    return uid && this.db.authUsers.some((u) => u.id === uid) ? uid : null;
  }

  // Executa uma escrita, registra no log e regrava o cookie.
  mutate(op: Op) {
    this.sync();
    const ids: string[] = [];
    const ctx: Ctx = { now: new Date().toISOString(), uid: this.uid, newId: () => { const v = randomId(); ids.push(v); return v; } };
    const out = applyAtomic(this.db, op, ctx);
    this.ops.push({ ...op, u: ctx.uid, n: ctx.now, ids });
    this.persist();
    return out;
  }

  private persist() {
    let ops = this.ops;
    let raw = encode(ops);
    while (raw.length > CHUNK * MAX_CHUNKS && ops.length > 1) {
      ops = ops.slice(Math.ceil(ops.length / 5)); // descarta as operações mais antigas
      raw = encode(ops);
    }
    this.lastRaw = raw;
    cache.set(`${this.day}|${raw}`, structuredClone(this.db));
    try {
      this.store.set(DAY_COOKIE, this.day, cookieOpts);
      for (let i = 0; i < MAX_CHUNKS; i++) {
        const part = raw.slice(i * CHUNK, (i + 1) * CHUNK);
        if (part) this.store.set(`${OPS_COOKIE}_${i}`, part, cookieOpts);
        else if (this.store.get(`${OPS_COOKIE}_${i}`)) this.store.set(`${OPS_COOKIE}_${i}`, "", { ...cookieOpts, maxAge: 0 });
      }
    } catch {
      /* renderização de Server Component: não dá pra gravar cookie (e não há escrita ali) */
    }
  }

  readDb() {
    this.sync();
    return this.db;
  }

  from(table: string) {
    return new DemoQuery(this, table);
  }

  async rpc(fn: string, args: Row = {}) {
    if (fn === "caixa_pendencias" || fn === "caixa_resumo") {
      try {
        const ctx: Ctx = { now: new Date().toISOString(), uid: this.uid, newId: randomId };
        return ok(applyOp(structuredClone(this.db), { k: "rpc", fn, a: args }, ctx).result);
      } catch (e) {
        return fail(e);
      }
    }
    try {
      return ok(this.mutate({ k: "rpc", fn, a: args }).result ?? null);
    } catch (e) {
      return fail(e);
    }
  }

  get auth() {
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias
    const session = () => {
      const uid = self.uid;
      if (!uid) return null;
      const u = self.db.authUsers.find((x) => x.id === uid)!;
      return { access_token: "demo", token_type: "bearer", expires_in: 86400, refresh_token: "demo", user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
    };
    return {
      getSession: async () => ({ data: { session: session() }, error: null }),
      getUser: async () => {
        const s = session();
        return s ? { data: { user: s.user }, error: null } : { data: { user: null }, error: { message: "Auth session missing!", code: "session_missing" } };
      },
      signInWithPassword: async ({ email }: { email: string; password: string }) => {
        const u = self.db.authUsers.find((x) => x.email === String(email).toLowerCase());
        if (!u) return { data: { user: null, session: null }, error: { message: "Invalid login credentials", code: "invalid_credentials" } };
        self.store.set(DEMO_UID_COOKIE, u.id, cookieOpts);
        return { data: { user: { id: u.id, email: u.email }, session: session() }, error: null };
      },
      signOut: async () => {
        self.store.set(DEMO_UID_COOKIE, "", { ...cookieOpts, maxAge: 0 });
        return { error: null };
      },
      admin: {
        createUser: async (a: Row) => self.admin("createUser", a),
        deleteUser: async (id: string) => self.admin("deleteUser", { id }),
        updateUserById: async (id: string, a: Row) => self.admin("updateUserById", { id, ...a }),
      },
    };
  }

  private admin(fn: string, a: Row) {
    try {
      return { data: this.mutate({ k: "adm", fn, a }).result, error: null };
    } catch (e) {
      return { data: { user: null }, error: toError(e) };
    }
  }
}

class DemoQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" | null = null;
  private payload: Row | Row[] | null = null;
  private selectStr = "*";
  private returning = false;
  private filters: Filter[] = [];
  private sorts: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private lim: number | null = null;
  private fromIdx = 0;
  private toIdx: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private countMode = false;
  private head = false;
  private onConflict: string | undefined;

  constructor(private client: DemoClient, private table: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.selectStr = cols;
    if (this.op === null) this.op = "select";
    else this.returning = true;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(v: Row | Row[]) { this.op = "insert"; this.payload = v; return this; }
  update(v: Row) { this.op = "update"; this.payload = v; return this; }
  upsert(v: Row | Row[], opts?: { onConflict?: string }) { this.op = "upsert"; this.payload = v; this.onConflict = opts?.onConflict; return this; }
  delete() { this.op = "delete"; return this; }

  private add(c: string, o: string, v: any) { this.filters.push({ c, o, v }); return this; }
  eq(c: string, v: any) { return this.add(c, "eq", v); }
  neq(c: string, v: any) { return this.add(c, "neq", v); }
  gt(c: string, v: any) { return this.add(c, "gt", v); }
  gte(c: string, v: any) { return this.add(c, "gte", v); }
  lt(c: string, v: any) { return this.add(c, "lt", v); }
  lte(c: string, v: any) { return this.add(c, "lte", v); }
  is(c: string, v: any) { return this.add(c, "is", v); }
  in(c: string, v: any[]) { return this.add(c, "in", v); }
  like(c: string, v: string) { return this.add(c, "like", v); }
  ilike(c: string, v: string) { return this.add(c, "ilike", v); }
  contains(c: string, v: any[]) { return this.add(c, "cs", v); }
  not(c: string, o: string, v: any) { return this.add(c, `not.${o}`, v === "null" ? null : v); }
  match(obj: Row) { Object.entries(obj).forEach(([c, v]) => this.add(c, "eq", v)); return this; }
  or(expr: string) { this.filters.push({ or: expr }); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opts?.ascending ?? true;
    this.sorts.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc });
    return this;
  }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.fromIdx = a; this.toIdx = b; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  returns() { return this; }
  abortSignal() { return this; }

  then<A = Result, B = never>(onF?: ((v: Result) => A | PromiseLike<A>) | null, onR?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(onF, onR);
  }

  private shape(rows: Row[], count: number | null): Result {
    if (this.mode === "single") {
      if (rows.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null }, status: 406, statusText: "Not Acceptable" };
      return ok(rows[0]);
    }
    if (this.mode === "maybe") {
      if (rows.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: null, hint: null }, status: 406, statusText: "Not Acceptable" };
      return ok(rows[0] ?? null);
    }
    return ok(rows, { count });
  }

  private run(): Result {
    const db = this.client.readDb();
    if (this.op === "select" || this.op === null) {
      const { rows, count } = runSelect(db, this.table, { select: this.selectStr, filters: this.filters, sorts: this.sorts, limit: this.lim, from: this.fromIdx, to: this.toIdx });
      if (this.head) return ok(null, { count });
      return this.shape(rows, this.countMode ? count : null);
    }

    const list = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
    let op: Op;
    if (this.op === "insert") op = { k: "ins", t: this.table, rows: list };
    else if (this.op === "upsert") op = { k: "ups", t: this.table, rows: list, oc: this.onConflict };
    else if (this.op === "update") op = { k: "upd", t: this.table, f: this.filters, v: this.payload as Row };
    else op = { k: "del", t: this.table, f: this.filters };

    let affected: Row[];
    try {
      affected = this.client.mutate(op).rows ?? [];
    } catch (e) {
      return fail(e);
    }
    if (!this.returning) return { data: null, error: null, status: 201, statusText: "Created" };

    const pk = this.table === "taxas_cartao" ? "tipo" : this.table === "caixa_apuracoes" ? "sessao_id" : "id";
    const keys = affected.map((r) => r[pk]);
    const source = this.op === "delete" ? { ...db, tables: { ...db.tables, [this.table]: affected } } : db;
    const { rows } = runSelect(source, this.table, { select: this.selectStr, filters: [{ c: pk, o: "in", v: keys }], sorts: [], limit: null, from: 0, to: null });
    rows.sort((a, b) => keys.indexOf(a[pk]) - keys.indexOf(b[pk]));
    return this.shape(rows, null);
  }
}

const porRequisicao = new WeakMap<object, DemoClient>();
export function createDemoClient(store: CookieStore) {
  let c = porRequisicao.get(store);
  if (!c) {
    c = new DemoClient(store);
    porRequisicao.set(store, c);
  }
  return c;
}

export function resetDemoCookies(store: CookieStore) {
  for (const name of [DAY_COOKIE, ...Array.from({ length: MAX_CHUNKS }, (_, i) => `${OPS_COOKIE}_${i}`)]) {
    store.set(name, "", { ...cookieOpts, maxAge: 0 });
  }
}

export { cookieOpts as demoCookieOptions };
