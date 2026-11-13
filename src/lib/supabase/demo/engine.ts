/* eslint-disable @typescript-eslint/no-explicit-any -- o banco falso trabalha com linhas genéricas, como o PostgREST */
// Motor do modo demonstração: um "Postgres de mentira" em memória que entende a
// parte da API do Supabase usada pelo app e reproduz, em TypeScript, as regras
// que no banco real ficam em triggers e funções SQL (supabase/migrations).
//
// Toda escrita vira uma operação serializável (Op). O estado de cada visitante é
// "seed do dia + as operações dele", guardadas num cookie — assim cada pessoa
// testa a demo sem ver o que as outras fizeram, e sem banco nenhum.

export type Row = Record<string, any>;
export type DB = { tables: Record<string, Row[]>; authUsers: { id: string; email: string }[] };
export type Filter = { c: string; o: string; v: any } | { or: string };
export type DemoErr = { message: string; code: string; details?: string | null; hint?: string | null };

export type Op =
  | { k: "ins"; t: string; rows: Row[] }
  | { k: "upd"; t: string; f: Filter[]; v: Row }
  | { k: "ups"; t: string; rows: Row[]; oc?: string }
  | { k: "del"; t: string; f: Filter[] }
  | { k: "rpc"; fn: string; a: Row }
  | { k: "adm"; fn: string; a: Row };
export type LoggedOp = Op & { u: string | null; n: string; ids: string[] };

export class DbError extends Error {
  constructor(message: string, public code = "P0001") {
    super(message);
  }
}
const raise = (msg: string): never => {
  throw new DbError(msg, "P0001");
};

// ---------- contexto de execução (relógio, usuário e gerador de ids) ----------
export type Ctx = { now: string; uid: string | null; newId: () => string };

export function randomId() {
  return globalThis.crypto.randomUUID();
}

// ---------- esquema ----------
const PK: Record<string, string[]> = {
  taxas_cartao: ["tipo"],
  caixa_apuracoes: ["sessao_id"],
};
const pkOf = (t: string) => PK[t] ?? ["id"];

// coluna -> tabela referenciada
const FK: Record<string, string> = {
  profissional_id: "profiles",
  servico_id: "servicos",
  comanda_id: "comandas",
  cliente_id: "clientes",
  categoria_id: "despesa_categorias",
  grupo_id: "despesa_grupos",
  caixa_sessao_id: "caixa_sessoes",
  sessao_id: "caixa_sessoes",
  agendamento_id: "agendamentos",
  estorna_id: "caixa_movimentos",
  comissao_despesa_id: "despesas",
  aberto_por: "profiles",
  fechado_por: "profiles",
  conferido_por: "profiles",
  criado_por: "profiles",
  feito_por: "profiles",
  transferido_por: "profiles",
  profissional_anterior_id: "profiles",
  profissional_novo_id: "profiles",
};

const UNIQUE: Record<string, string[][]> = {
  servicos: [["nome"]],
  despesa_grupos: [["nome"]],
  despesa_categorias: [["grupo_id", "nome"], ["sistema_chave"]],
  profissional_horarios: [["profissional_id", "dia_semana"]],
  caixa_movimentos: [["estorna_id"]],
};

type OnDelete = { table: string; fk: string; action: "cascade" | "set null" | "restrict" };
const ON_DELETE: Record<string, OnDelete[]> = {
  comandas: [
    { table: "comanda_itens", fk: "comanda_id", action: "cascade" },
    { table: "agendamentos", fk: "comanda_id", action: "set null" },
  ],
  agendamentos: [{ table: "agendamento_transferencias", fk: "agendamento_id", action: "cascade" }],
  profiles: [
    { table: "profissional_horarios", fk: "profissional_id", action: "cascade" },
    { table: "agendamentos", fk: "profissional_id", action: "restrict" },
  ],
  clientes: [
    { table: "comandas", fk: "cliente_id", action: "set null" },
    { table: "agendamentos", fk: "cliente_id", action: "set null" },
  ],
  despesas: [{ table: "comanda_itens", fk: "comissao_despesa_id", action: "set null" }],
  despesa_categorias: [{ table: "despesas", fk: "categoria_id", action: "restrict" }],
  despesa_grupos: [{ table: "despesa_categorias", fk: "grupo_id", action: "restrict" }],
  servicos: [{ table: "agendamentos", fk: "servico_id", action: "restrict" }],
};

function defaults(t: string, ctx: Ctx): Row {
  const today = hojeSPFrom(ctx.now);
  const stamps = { created_at: ctx.now };
  switch (t) {
    case "profiles":
      return { ...stamps, role: "staff", especialidades: [], ativo: true, desativado_em: null, isenta_parte_salao: false };
    case "comandas":
      return { ...stamps, updated_at: ctx.now, data: today, cliente_nome: null, cliente_contato: null, cliente_id: null, pagamentos: [], total: 0, caixa_sessao_id: null, criado_por: null };
    case "comanda_itens":
      return { profissional_id: null, valor: 0, ordem: 0, comissao_pago_em: null, comissao_valor_pago: null, comissao_despesa_id: null };
    case "servicos":
      return { ...stamps, comissao_percentual: 30, ativo: true, ordem: 0, duracao_minutos: 60 };
    case "agendamentos":
      return { ...stamps, updated_at: ctx.now, duracao_minutos: 60, cliente_contato: null, cliente_id: null, servico_id: null, status: "agendado", observacoes: null, motivo_cancelamento: null, comanda_id: null, criado_por: null };
    case "agendamento_transferencias":
      return { ...stamps, motivo: null, transferido_por: null };
    case "clientes":
      return { ...stamps, updated_at: ctx.now, contato: null, observacoes: null };
    case "despesa_grupos":
      return { ordem: 0 };
    case "despesa_categorias":
      return { ...stamps, ativa: true, sistema_chave: null, ordem: 0 };
    case "despesas":
      return { ...stamps, updated_at: ctx.now, data: today, fornecedor: null, forma_pagamento: null, status: "pago", data_vencimento: null, data_pagamento: null, observacoes: null, criado_por: null, caixa_sessao_id: null };
    case "taxas_cartao":
      return { taxa_percentual: 0, updated_at: ctx.now };
    case "caixa_movimentos":
    case "caixa_eventos":
      return { ...stamps };
    default:
      return {};
  }
}

const HAS_UPDATED_AT = new Set(["comandas", "agendamentos", "clientes", "despesas", "taxas_cartao"]);

// ---------- datas e horas ----------
export function hojeSPFrom(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
const toMin = (t: string) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};
const fmtTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
const normTime = (t: string | null | undefined) => (t == null ? t : fmtTime(toMin(t)));
const dow = (dateISO: string) => new Date(dateISO + "T12:00:00Z").getUTCDay();
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const num = (v: any) => Number(v ?? 0);
const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------- select("*, alias:coluna(cols), tabela!inner(cols)") ----------
type Embed = { key: string; ref: string; inner: boolean; node: SelNode };
type SelNode = { all: boolean; cols: string[]; embeds: Embed[] };

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(s: string): SelNode {
  const node: SelNode = { all: false, cols: [], embeds: [] };
  for (const tok of splitTop((s || "*").replace(/\s+/g, " "))) {
    const m = tok.match(/^(?:([a-zA-Z_]+):)?([a-zA-Z_]+)((?:![a-zA-Z_]+)*)\(([\s\S]*)\)$/);
    if (m) {
      node.embeds.push({ key: m[1] ?? m[2], ref: m[2], inner: m[3].includes("!inner"), node: parseSelect(m[4]) });
    } else if (tok === "*") node.all = true;
    else node.cols.push(tok.split(":").pop()!.trim());
  }
  return node;
}

type Rel = { kind: "parent"; table: string; col: string } | { kind: "child"; table: string; col: string; one: boolean };

function resolveRel(table: string, ref: string, db: DB): Rel | null {
  // alias:coluna_fk(...) ou tabela_pai(...) via coluna fk desta tabela
  if (FK[ref]) return { kind: "parent", table: FK[ref], col: ref };
  const sample = db.tables[table]?.[0] ?? {};
  const parentCol = Object.keys(FK).find((c) => FK[c] === ref && c in sample);
  if (parentCol) return { kind: "parent", table: ref, col: parentCol };
  // tabela filha que aponta para esta
  const childSample = db.tables[ref]?.[0];
  const childCols = childSample ? Object.keys(childSample) : Object.keys(FK);
  const childCol = childCols.find((c) => FK[c] === table);
  if (childCol) {
    const one = pkOf(ref).length === 1 && pkOf(ref)[0] === childCol;
    return { kind: "child", table: ref, col: childCol, one };
  }
  return null;
}

function project(table: string, row: Row, node: SelNode, db: DB, embedFilters: Map<string, Filter[]>, path = ""): Row | null {
  const out: Row = {};
  if (node.all) Object.assign(out, row);
  for (const c of node.cols) out[c] = row[c] ?? null;
  for (const e of node.embeds) {
    const rel = resolveRel(table, e.ref, db);
    const key = path ? `${path}.${e.key}` : e.key;
    const fs = embedFilters.get(key) ?? [];
    if (!rel) {
      out[e.key] = null;
      continue;
    }
    if (rel.kind === "parent") {
      const target = (db.tables[rel.table] ?? []).find((r) => r.id === row[rel.col]);
      const ok = target && fs.every((f) => matches(target, f));
      out[e.key] = ok ? project(rel.table, target!, e.node, db, embedFilters, key) : null;
    } else {
      const kids = (db.tables[rel.table] ?? []).filter((r) => r[rel.col] === row[pkOf(table)[0]] && fs.every((f) => matches(r, f)));
      const projected = kids.map((k) => project(rel.table, k, e.node, db, embedFilters, key));
      out[e.key] = rel.one ? (projected[0] ?? null) : projected;
    }
    if (e.inner) {
      const v = out[e.key];
      if (v == null || (Array.isArray(v) && v.length === 0)) return null;
    }
  }
  return out;
}

// ---------- filtros ----------
function compare(a: any, b: any): number {
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a);
    const y = Number(b);
    if (!isNaN(x) && !isNaN(y)) return x - y;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
const likeRe = (p: string, flags: string) =>
  new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", flags);

function test(op: string, a: any, b: any): boolean {
  switch (op) {
    case "eq": return a != null && String(a) === String(b);
    case "neq": return a == null || String(a) !== String(b);
    case "gt": return a != null && compare(a, b) > 0;
    case "gte": return a != null && compare(a, b) >= 0;
    case "lt": return a != null && compare(a, b) < 0;
    case "lte": return a != null && compare(a, b) <= 0;
    case "is": return b === null || b === "null" ? a == null : String(a) === String(b);
    case "in": return (b as any[]).map(String).includes(String(a));
    case "like": return a != null && likeRe(String(b), "").test(String(a));
    case "ilike": return a != null && likeRe(String(b), "i").test(String(a));
    case "cs": return Array.isArray(a) && (b as any[]).every((x) => a.includes(x));
    default: return true;
  }
}

function parseLiteral(op: string, v: string): any {
  if (op === "in") return v.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  if (op === "is") return v === "null" ? null : v;
  return v;
}

export function matches(row: Row, f: Filter): boolean {
  if ("or" in f) {
    return splitTop(f.or).some((cond) => {
      const neg = cond.includes(".not.");
      const [c, o, ...rest] = cond.replace(".not.", ".").split(".");
      return test(o, row[c], parseLiteral(o, rest.join("."))) !== neg;
    });
  }
  if (f.o.startsWith("not.")) return !test(f.o.slice(4), row[f.c], f.v);
  return test(f.o, row[f.c], f.v);
}

// ---------- leitura ----------
export type SelectOpts = {
  select: string;
  filters: Filter[];
  sorts: { col: string; asc: boolean; nullsFirst: boolean }[];
  limit: number | null;
  from: number;
  to: number | null;
};

export function runSelect(db: DB, table: string, o: SelectOpts) {
  const node = parseSelect(o.select);
  const own = o.filters.filter((f) => "or" in f || !f.c.includes("."));
  const embedFilters = new Map<string, Filter[]>();
  for (const f of o.filters) {
    if ("or" in f || !f.c.includes(".")) continue;
    const i = f.c.lastIndexOf(".");
    const path = f.c.slice(0, i);
    embedFilters.set(path, [...(embedFilters.get(path) ?? []), { ...f, c: f.c.slice(i + 1) }]);
  }
  let rows = (db.tables[table] ?? [])
    .filter((r) => own.every((f) => matches(r, f)))
    .map((r) => ({ raw: r, proj: project(table, r, node, db, embedFilters) }))
    .filter((x) => x.proj !== null) as { raw: Row; proj: Row }[];
  for (const s of [...o.sorts].reverse()) {
    rows = [...rows].sort((x, y) => {
      const a = x.raw[s.col] ?? x.proj[s.col];
      const b = y.raw[s.col] ?? y.proj[s.col];
      if (a == null || b == null) {
        if (a == null && b == null) return 0;
        return (a == null) === s.nullsFirst ? -1 : 1;
      }
      return s.asc ? compare(a, b) : compare(b, a);
    });
  }
  const count = rows.length;
  const end = o.to != null ? o.to + 1 : o.limit != null ? o.from + o.limit : undefined;
  return { rows: rows.slice(o.from, end).map((x) => structuredClone(x.proj)), count };
}

// ---------- escrita ----------
const isAdmin = (db: DB, uid: string | null) => !!uid && db.tables.profiles?.some((p) => p.id === uid && p.role === "admin");
const caixaAberto = (db: DB) => (db.tables.caixa_sessoes ?? []).find((s) => s.status === "aberto") ?? null;
const sessao = (db: DB, id: string | null) => (id ? (db.tables.caixa_sessoes ?? []).find((s) => s.id === id) ?? null : null);

function beforeWrite(db: DB, t: string, op: "INSERT" | "UPDATE" | "DELETE", row: Row | null, old: Row | null, ctx: Ctx): Row | null {
  if (op === "UPDATE" && HAS_UPDATED_AT.has(t)) row!.updated_at = ctx.now;

  switch (t) {
    case "agendamentos": {
      if (op === "DELETE") return old;
      const r = row!;
      r.hora_inicio = normTime(r.hora_inicio);
      r.hora_fim = fmtTime(toMin(r.hora_inicio) + num(r.duracao_minutos));
      if (num(r.duracao_minutos) <= 0 || num(r.duracao_minutos) > 480) throw new DbError("duração inválida", "23514");
      if (!["cancelado", "nao_compareceu"].includes(r.status)) {
        const h = (db.tables.profissional_horarios ?? []).find((x) => x.profissional_id === r.profissional_id && x.dia_semana === dow(r.data));
        if (!h) raise("Esse profissional não trabalha neste dia da semana.");
        if (toMin(r.hora_inicio) < toMin(h!.horario_inicio) || toMin(r.hora_fim) > toMin(h!.horario_fim)) {
          raise(`Fora do horário de trabalho do profissional nesse dia (${h!.horario_inicio.slice(0, 5)} às ${h!.horario_fim.slice(0, 5)}).`);
        }
        const conflito = (db.tables.agendamentos ?? []).some(
          (a) =>
            a.id !== r.id &&
            a.profissional_id === r.profissional_id &&
            a.data === r.data &&
            !["cancelado", "nao_compareceu"].includes(a.status) &&
            toMin(a.hora_inicio) < toMin(r.hora_fim) &&
            toMin(r.hora_inicio) < toMin(a.hora_fim),
        );
        if (conflito) throw new DbError('conflicting key value violates exclusion constraint "agendamentos_profissional_id_periodo_excl"', "23P01");
      }
      return r;
    }

    case "comandas": {
      if (op === "DELETE") {
        const s = sessao(db, old!.caixa_sessao_id);
        if (s && s.status !== "aberto") raise("Esta comanda é de um caixa já fechado e não pode ser excluída.");
        return old;
      }
      const r = row!;
      const aberta = caixaAberto(db)?.id ?? null;
      let acrescimo = false;
      if (op === "INSERT") {
        if (!aberta) raise("Abra o caixa antes de lançar comandas.");
        r.caixa_sessao_id = aberta;
      } else {
        r.caixa_sessao_id = old!.caixa_sessao_id;
        const antes: any[] = old!.pagamentos ?? [];
        const depois: any[] = r.pagamentos ?? [];
        if (aberta && !same(depois, antes) && depois.length > antes.length) {
          acrescimo = same(depois.slice(0, antes.length), antes) && depois.slice(antes.length).every((p) => p.sessao_id === aberta);
        }
        const s = sessao(db, old!.caixa_sessao_id);
        if (s && s.status !== "aberto" && (num(r.total) !== num(old!.total) || r.data !== old!.data || (!same(r.pagamentos, old!.pagamentos) && !acrescimo))) {
          raise("Esta comanda é de um caixa já fechado e não pode ser alterada. Para receber o restante, use Duplicatas.");
        }
      }
      const antigos: any[] = op === "UPDATE" ? old!.pagamentos ?? [] : [];
      for (const p of r.pagamentos ?? []) {
        if (p.sessao_id != null && p.sessao_id !== aberta && !antigos.some((x) => same(x, p))) raise("Pagamento marcado com um caixa que não está aberto.");
      }
      if (r.caixa_sessao_id || acrescimo) {
        if ((r.pagamentos ?? []).some((p: any) => p.forma === "dinheiro" && p.valor_recebido != null && num(p.valor_recebido) < num(p.valor))) {
          raise("O valor recebido em dinheiro é menor que o valor pago em dinheiro.");
        }
        const pago = (r.pagamentos ?? []).reduce((s: number, p: any) => s + num(p.valor), 0);
        if (pago > num(r.total) + 0.0001) {
          raise('Os pagamentos somam mais que o total da comanda. Se o cliente deu dinheiro a mais, use o campo "Recebido" para calcular o troco.');
        }
      }
      return r;
    }

    case "comanda_itens": {
      if (op === "UPDATE" && row!.comanda_id === old!.comanda_id && row!.servico === old!.servico && num(row!.valor) === num(old!.valor)) {
        if (row!.profissional_id !== old!.profissional_id) {
          const c = (db.tables.comandas ?? []).find((x) => x.id === row!.comanda_id);
          const s = sessao(db, c?.caixa_sessao_id ?? null);
          if (s && s.status !== "aberto" && !isAdmin(db, ctx.uid)) raise("Só a administração pode trocar a profissional de uma comanda de caixa já fechado.");
        }
        return row;
      }
      const comandaId = op === "DELETE" ? old!.comanda_id : row!.comanda_id;
      const c = (db.tables.comandas ?? []).find((x) => x.id === comandaId);
      const s = sessao(db, c?.caixa_sessao_id ?? null);
      if (s && s.status !== "aberto") raise("Esta comanda é de um caixa já fechado e não pode ser alterada.");
      if (op === "UPDATE" && row!.comanda_id !== old!.comanda_id) raise("Não é permitido mover itens entre comandas.");
      return row ?? old;
    }

    case "despesas": {
      if ((op === "UPDATE" || op === "DELETE") && old!.caixa_sessao_id) {
        const s = sessao(db, old!.caixa_sessao_id);
        if (
          s && s.status !== "aberto" &&
          (op === "DELETE" || num(row!.valor) !== num(old!.valor) || row!.forma_pagamento !== old!.forma_pagamento ||
            row!.status !== old!.status || row!.data !== old!.data || row!.caixa_sessao_id !== old!.caixa_sessao_id)
        ) {
          raise("Esta despesa saiu de um caixa já fechado e não pode ser alterada.");
        }
      }
      if (op === "DELETE") return old;
      const r = row!;
      if (r.caixa_sessao_id && (op === "INSERT" || r.caixa_sessao_id !== old!.caixa_sessao_id || num(r.valor) !== num(old!.valor))) {
        if (!isAdmin(db, ctx.uid)) raise("Apenas administradores podem tirar dinheiro do caixa.");
        const s = sessao(db, r.caixa_sessao_id);
        if (!s || s.status !== "aberto") raise("O caixa dessa despesa não está aberto.");
        if (r.forma_pagamento !== "dinheiro" || r.status !== "pago") raise("Só despesa já paga em dinheiro pode sair do caixa.");
        let saldo = num(caixaCalcular(db, r.caixa_sessao_id).esperado_dinheiro);
        if (op === "UPDATE" && old!.caixa_sessao_id === r.caixa_sessao_id) saldo += num(old!.valor);
        if (num(r.valor) > saldo + 0.0001) raise("Não há dinheiro suficiente no caixa para essa despesa.");
        r.data = s!.data_operacional;
        r.data_pagamento = s!.data_operacional;
      } else if (r.caixa_sessao_id && (r.forma_pagamento !== "dinheiro" || r.status !== "pago")) {
        raise("Só despesa já paga em dinheiro pode sair do caixa.");
      }
      return r;
    }

    case "caixa_movimentos":
      if (op !== "INSERT") raise("Lançamentos de caixa não podem ser alterados nem excluídos. Use o estorno.");
      return row;

    case "caixa_sessoes":
      if (op === "DELETE") return old;
      row!.retirada_final = row!.contado_dinheiro != null && row!.fundo_deixado != null ? round2(num(row!.contado_dinheiro) - num(row!.fundo_deixado)) : null;
      return row;

    case "profissional_horarios":
      if (op === "DELETE") return old;
      row!.horario_inicio = normTime(row!.horario_inicio);
      row!.horario_fim = normTime(row!.horario_fim);
      if (toMin(row!.horario_inicio) >= toMin(row!.horario_fim)) throw new DbError("horário inválido", "23514");
      return row;

    default:
      return op === "DELETE" ? old : row;
  }
}

function checkUnique(db: DB, t: string, row: Row) {
  for (const cols of UNIQUE[t] ?? []) {
    if (cols.some((c) => row[c] == null)) continue;
    const pk = pkOf(t);
    const dup = (db.tables[t] ?? []).some((r) => r !== row && !pk.every((k) => r[k] === row[k]) && cols.every((c) => String(r[c]) === String(row[c])));
    if (dup) throw new DbError(`duplicate key value violates unique constraint "${t}_${cols.join("_")}_key"`, "23505");
  }
}

export function insertRows(db: DB, t: string, input: Row[], ctx: Ctx): Row[] {
  const table = (db.tables[t] ??= []);
  const out: Row[] = [];
  for (const v of input) {
    let row: Row = { ...defaults(t, ctx), ...structuredClone(v) };
    if (pkOf(t)[0] === "id" && !row.id) row.id = ctx.newId();
    row = beforeWrite(db, t, "INSERT", row, null, ctx)!;
    if (table.some((r) => pkOf(t).every((k) => r[k] === row[k]))) throw new DbError(`duplicate key value violates unique constraint "${t}_pkey"`, "23505");
    table.push(row);
    checkUnique(db, t, row);
    out.push(row);
  }
  return out;
}

export function updateRows(db: DB, t: string, filters: Filter[], values: Row, ctx: Ctx): Row[] {
  const table = db.tables[t] ?? [];
  const targets = table.filter((r) => filters.every((f) => matches(r, f)));
  const out: Row[] = [];
  for (const old of targets) {
    const next = beforeWrite(db, t, "UPDATE", { ...structuredClone(old), ...structuredClone(values) }, old, ctx)!;
    const i = table.indexOf(old);
    table[i] = next;
    checkUnique(db, t, next);
    out.push(next);
  }
  return out;
}

export function deleteRows(db: DB, t: string, filters: Filter[], ctx: Ctx): Row[] {
  const table = db.tables[t] ?? [];
  const targets = table.filter((r) => filters.every((f) => matches(r, f)));
  for (const old of targets) {
    beforeWrite(db, t, "DELETE", null, old, ctx);
    for (const rule of ON_DELETE[t] ?? []) {
      const deps = (db.tables[rule.table] ?? []).filter((r) => r[rule.fk] === old.id);
      if (!deps.length) continue;
      if (rule.action === "restrict") {
        throw new DbError(`update or delete on table "${t}" violates foreign key constraint on table "${rule.table}"`, "23503");
      }
      if (rule.action === "set null") deps.forEach((d) => (d[rule.fk] = null));
      else deleteRows(db, rule.table, [{ c: rule.fk, o: "eq", v: old.id }], ctx);
    }
  }
  const gone = new Set(targets);
  db.tables[t] = table.filter((r) => !gone.has(r));
  return targets;
}

export function upsertRows(db: DB, t: string, input: Row[], onConflict: string | undefined, ctx: Ctx): Row[] {
  const keys = onConflict ? onConflict.split(",").map((s) => s.trim()) : pkOf(t);
  const out: Row[] = [];
  for (const v of input) {
    const existing = (db.tables[t] ?? []).find((r) => keys.every((k) => String(r[k]) === String(v[k])));
    if (existing) out.push(...updateRows(db, t, keys.map((k) => ({ c: k, o: "eq", v: v[k] })), v, ctx));
    else out.push(...insertRows(db, t, [v], ctx));
  }
  return out;
}

// ---------- funções do caixa (port de 0011_caixa.sql / 0012) ----------
export function caixaCalcular(db: DB, sid: string) {
  const s = sessao(db, sid);
  const agg: Record<string, { valor: number; troco: number; posterior: number }> = {};
  for (const c of db.tables.comandas ?? []) {
    const pags: any[] = c.pagamentos ?? [];
    if (c.caixa_sessao_id !== sid && !pags.some((p) => p.sessao_id === sid)) continue;
    for (const p of pags) {
      if ((p.sessao_id ?? c.caixa_sessao_id) !== sid) continue;
      const a = (agg[p.forma] ??= { valor: 0, troco: 0, posterior: 0 });
      a.valor += num(p.valor);
      a.troco += Math.max(num(p.valor_recebido ?? p.valor) - num(p.valor), 0);
      if (c.caixa_sessao_id !== sid) a.posterior += num(p.valor);
    }
  }
  const efeitos = new Map<string, number>();
  const movs = db.tables.caixa_movimentos ?? [];
  for (const m of movs.filter((x) => x.sessao_id === sid)) {
    const orig = m.estorna_id ? movs.find((x) => x.id === m.estorna_id) : null;
    const tipo = orig?.tipo ?? m.tipo;
    efeitos.set(tipo, (efeitos.get(tipo) ?? 0) + (m.sentido === "entrada" ? num(m.valor) : -num(m.valor)));
  }
  for (const d of (db.tables.despesas ?? []).filter((x) => x.caixa_sessao_id === sid)) {
    const cat = (db.tables.despesa_categorias ?? []).find((x) => x.id === d.categoria_id);
    const tipo = cat?.sistema_chave === "comissoes_pagas" ? "comissao" : "despesa";
    efeitos.set(tipo, (efeitos.get(tipo) ?? 0) - num(d.valor));
  }
  const movimentos = [...efeitos].filter(([, e]) => Math.abs(e) > 0.0001).sort(([a], [b]) => a.localeCompare(b)).map(([tipo, efeito]) => ({ tipo, efeito: round2(efeito) }));
  const mov = movimentos.reduce((acc, m) => acc + m.efeito, 0);
  const fundo = num(s?.fundo_contado);
  const dinheiro = agg.dinheiro?.valor ?? 0;
  const pix = agg.pix?.valor ?? 0;
  const cartao = agg.cartao?.valor ?? 0;
  return {
    fundo,
    comandas_dinheiro: round2(dinheiro),
    comandas_pix: round2(pix),
    comandas_cartao: round2(cartao),
    comandas_total: round2(dinheiro + pix + cartao),
    troco_dado: round2(agg.dinheiro?.troco ?? 0),
    recebido_duplicatas: round2(Object.values(agg).reduce((acc, a) => acc + a.posterior, 0)),
    qtd_comandas: (db.tables.comandas ?? []).filter((c) => c.caixa_sessao_id === sid).length,
    movimentos,
    esperado_dinheiro: round2(fundo + dinheiro + mov),
    esperado_cartao: round2(cartao),
    esperado_pix: round2(pix),
  };
}

const fmtBR = (n: number) => n.toFixed(2).replace(".", ",");
const textoOuNull = (v: any) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

export function runRpc(db: DB, fn: string, a: Row, ctx: Ctx): any {
  const uid = ctx.uid;
  const exigeLogin = () => !uid && raise("Sessão expirada, faça login novamente.");
  const evento = (sessao_id: string, ev: string, motivo: string | null, detalhe: any = null) =>
    insertRows(db, "caixa_eventos", [{ sessao_id, evento: ev, motivo, detalhe, feito_por: uid }], ctx);

  switch (fn) {
    case "caixa_pendencias":
      return (db.tables.comandas ?? [])
        .filter((c) => c.caixa_sessao_id === a.p_sessao_id)
        .map((c) => ({ comanda_id: c.id, cliente_nome: c.cliente_nome, total: num(c.total), pago: round2((c.pagamentos ?? []).reduce((s: number, p: any) => s + num(p.valor), 0)), created_at: c.created_at }))
        .filter((x) => x.total - x.pago > 0.009)
        .sort((x, y) => compare(x.created_at, y.created_at))
        .map(({ created_at: _c, ...x }) => x);

    case "caixa_resumo":
      if (!isAdmin(db, uid)) raise("Apenas administradores podem ver o resumo do caixa.");
      return caixaCalcular(db, a.p_sessao_id);

    case "abrir_caixa": {
      exigeLogin();
      if (!isAdmin(db, uid)) raise("Apenas administradores podem abrir o caixa.");
      if (a.p_fundo_contado == null || num(a.p_fundo_contado) < 0) raise("Informe o valor contado na gaveta.");
      if (caixaAberto(db)) raise("Já existe um caixa aberto.");
      const just = textoOuNull(a.p_justificativa);
      const contado = round2(a.p_fundo_contado);
      let esperado = contado;
      const anterior = [...(db.tables.caixa_sessoes ?? [])].filter((s) => s.status !== "aberto").sort((x, y) => compare(y.fechado_em, x.fechado_em))[0];
      if (anterior) {
        esperado = num(anterior.fundo_deixado);
        if (contado !== esperado && !just) raise(`O valor contado é diferente do que ficou no último fechamento (R$ ${fmtBR(esperado)}). Informe o motivo.`);
      }
      const [s] = insertRows(db, "caixa_sessoes", [{
        status: "aberto", data_operacional: hojeSPFrom(ctx.now), aberto_por: uid, aberto_em: ctx.now,
        fundo_esperado: esperado, fundo_contado: contado, fundo_cedulas: a.p_cedulas ?? null, justificativa_abertura: just,
        fechado_por: null, fechado_em: null, contado_dinheiro: null, contado_cedulas: null, informado_cartao: null, informado_pix: null,
        fundo_deixado: null, observacao_fechamento: null, conferido_por: null, conferido_em: null, observacao_conferencia: null,
      }], ctx);
      evento(s.id, "abertura", just);
      return s.id;
    }

    case "receber_pagamento": {
      exigeLogin();
      const forma = a.p_forma;
      if (!["dinheiro", "pix", "cartao"].includes(forma)) raise("Forma de pagamento inválida.");
      if (forma === "cartao" && !["debito", "credito"].includes(a.p_tipo_cartao ?? "")) raise("Selecione Débito ou Crédito para o pagamento no cartão.");
      const valor = round2(a.p_valor);
      if (!(valor > 0)) raise("Informe um valor maior que zero.");
      const recebido = a.p_valor_recebido == null ? null : round2(a.p_valor_recebido);
      if (forma === "dinheiro" && recebido != null && recebido < valor) raise("O valor recebido em dinheiro é menor que o valor pago em dinheiro.");
      const s = caixaAberto(db);
      if (!s) raise("Abra o caixa antes de receber pagamentos.");
      const c = (db.tables.comandas ?? []).find((x) => x.id === a.p_comanda_id);
      if (!c) raise("Comanda não encontrada.");
      const saldo = num(c!.total) - (c!.pagamentos ?? []).reduce((acc: number, p: any) => acc + num(p.valor), 0);
      if (valor > saldo + 0.009) raise(`O valor é maior que o saldo em aberto da comanda (R$ ${fmtBR(Math.max(saldo, 0))}).`);
      const pag: Row = { forma, valor, sessao_id: s!.id, recebido_em: ctx.now, recebido_por: uid };
      if (forma === "cartao") pag.tipo_cartao = a.p_tipo_cartao;
      if (forma === "cartao" && a.p_tipo_cartao === "credito" && a.p_parcelas != null) pag.parcelas = a.p_parcelas;
      if (forma === "dinheiro" && recebido != null) pag.valor_recebido = recebido;
      updateRows(db, "comandas", [{ c: "id", o: "eq", v: c!.id }], { pagamentos: [...(c!.pagamentos ?? []), pag] }, ctx);
      return null;
    }

    case "lancar_movimento": {
      exigeLogin();
      if (!isAdmin(db, uid)) raise("Apenas administradores podem lançar no caixa.");
      let sentido: string | null = null;
      if (a.p_tipo === "suprimento") sentido = "entrada";
      else if (a.p_tipo === "sangria" || a.p_tipo === "ajuste") sentido = a.p_tipo === "sangria" ? "saida" : a.p_sentido ?? null;
      else raise("Tipo de lançamento inválido.");
      if (!sentido || !["entrada", "saida"].includes(sentido)) raise("Informe se o ajuste é entrada ou saída.");
      const valor = round2(a.p_valor);
      if (!(valor > 0)) raise("Informe um valor maior que zero.");
      const descricao = textoOuNull(a.p_descricao);
      if (!descricao) raise("Informe a descrição do lançamento.");
      const s = caixaAberto(db);
      if (!s) raise("Nenhum caixa aberto.");
      if (sentido === "saida" && valor > caixaCalcular(db, s!.id).esperado_dinheiro + 0.0001) raise("Não há dinheiro suficiente no caixa para essa saída.");
      const [m] = insertRows(db, "caixa_movimentos", [{ sessao_id: s!.id, tipo: a.p_tipo, sentido, valor, descricao, estorna_id: null, criado_por: uid }], ctx);
      return m.id;
    }

    case "estornar_movimento": {
      if (!isAdmin(db, uid)) raise("Apenas administradores podem estornar lançamentos.");
      const motivo = textoOuNull(a.p_motivo);
      if (!motivo) raise("Informe o motivo do estorno.");
      const s = caixaAberto(db);
      if (!s) raise("Nenhum caixa aberto.");
      const movs = db.tables.caixa_movimentos ?? [];
      const orig = movs.find((m) => m.id === a.p_movimento_id);
      if (!orig) raise("Lançamento não encontrado.");
      if (orig!.sessao_id !== s!.id) raise("Só é possível estornar lançamentos do caixa aberto. Para corrigir um caixa anterior, lance um ajuste.");
      if (orig!.tipo === "estorno") raise("Não é possível estornar um estorno.");
      if (movs.some((m) => m.estorna_id === orig!.id)) raise("Esse lançamento já foi estornado.");
      if (orig!.sentido === "entrada" && num(orig!.valor) > caixaCalcular(db, s!.id).esperado_dinheiro + 0.0001) raise("Não há dinheiro suficiente no caixa para esse estorno.");
      const [m] = insertRows(db, "caixa_movimentos", [{
        sessao_id: s!.id, tipo: "estorno", sentido: orig!.sentido === "entrada" ? "saida" : "entrada",
        valor: orig!.valor, descricao: motivo, estorna_id: orig!.id, criado_por: uid,
      }], ctx);
      return m.id;
    }

    case "fechar_caixa": {
      exigeLogin();
      if (!isAdmin(db, uid)) raise("Apenas administradores podem fechar o caixa.");
      const contado = a.p_contado_dinheiro == null ? null : round2(a.p_contado_dinheiro);
      const cartao = a.p_informado_cartao == null ? null : round2(a.p_informado_cartao);
      const pix = a.p_informado_pix == null ? null : round2(a.p_informado_pix);
      const fundo = a.p_fundo_deixado == null ? null : round2(a.p_fundo_deixado);
      if (contado == null || contado < 0) raise("Informe o dinheiro contado na gaveta.");
      if (cartao == null || cartao < 0 || pix == null || pix < 0) raise("Informe os totais de cartão e Pix (use 0 se não houve).");
      if (fundo == null || fundo < 0 || fundo > contado!) raise("O fundo que fica na gaveta precisa ser entre zero e o valor contado.");
      const s = caixaAberto(db);
      if (!s) raise("Nenhum caixa aberto.");
      const calc = caixaCalcular(db, s!.id);
      insertRows(db, "caixa_apuracoes", [{
        sessao_id: s!.id,
        esperado_dinheiro: calc.esperado_dinheiro, esperado_cartao: calc.esperado_cartao, esperado_pix: calc.esperado_pix,
        diferenca_dinheiro: round2(contado! - calc.esperado_dinheiro), diferenca_cartao: round2(cartao! - calc.esperado_cartao),
        diferenca_pix: round2(pix! - calc.esperado_pix), detalhe: calc, created_at: ctx.now,
      }], ctx);
      const obs = textoOuNull(a.p_observacao);
      updateRows(db, "caixa_sessoes", [{ c: "id", o: "eq", v: s!.id }], {
        status: "fechado", fechado_por: uid, fechado_em: ctx.now, contado_dinheiro: contado, contado_cedulas: a.p_cedulas ?? null,
        informado_cartao: cartao, informado_pix: pix, fundo_deixado: fundo, observacao_fechamento: obs,
      }, ctx);
      evento(s!.id, "fechamento", obs);
      return s!.id;
    }

    case "conferir_caixa": {
      if (!isAdmin(db, uid)) raise("Apenas administradores podem conferir o caixa.");
      const s = sessao(db, a.p_sessao_id);
      if (!s || s.status !== "fechado") raise("Só é possível conferir um caixa fechado.");
      const ap = (db.tables.caixa_apuracoes ?? []).find((x) => x.sessao_id === s!.id);
      const obs = textoOuNull(a.p_observacao);
      const diferenca = ap && (num(ap.diferenca_dinheiro) !== 0 || num(ap.diferenca_cartao) !== 0 || num(ap.diferenca_pix) !== 0);
      if ((diferenca || num(s!.fundo_contado) !== num(s!.fundo_esperado)) && !obs) raise("Há diferença neste caixa. Escreva uma observação explicando antes de conferir.");
      updateRows(db, "caixa_sessoes", [{ c: "id", o: "eq", v: s!.id }], { status: "conferido", conferido_por: uid, conferido_em: ctx.now, observacao_conferencia: obs }, ctx);
      evento(s!.id, "conferencia", obs);
      return null;
    }

    case "reabrir_caixa": {
      if (!isAdmin(db, uid)) raise("Apenas administradores podem reabrir o caixa.");
      const motivo = textoOuNull(a.p_motivo);
      if (!motivo) raise("Informe o motivo da reabertura.");
      const s = sessao(db, a.p_sessao_id);
      if (!s || s.status !== "fechado") raise("Só é possível reabrir um caixa fechado e ainda não conferido.");
      if (caixaAberto(db)) raise("Feche o caixa atual antes de reabrir um anterior.");
      if ((db.tables.caixa_sessoes ?? []).some((x) => compare(x.aberto_em, s!.aberto_em) > 0)) raise("Só o último caixa pode ser reaberto. Para corrigir, lance um ajuste no caixa atual.");
      const ap = (db.tables.caixa_apuracoes ?? []).find((x) => x.sessao_id === s!.id) ?? null;
      evento(s!.id, "reabertura", motivo, { sessao: structuredClone(s), apuracao: structuredClone(ap) });
      db.tables.caixa_apuracoes = (db.tables.caixa_apuracoes ?? []).filter((x) => x.sessao_id !== s!.id);
      updateRows(db, "caixa_sessoes", [{ c: "id", o: "eq", v: s!.id }], {
        status: "aberto", fechado_por: null, fechado_em: null, contado_dinheiro: null, contado_cedulas: null,
        informado_cartao: null, informado_pix: null, fundo_deixado: null, observacao_fechamento: null,
      }, ctx);
      return null;
    }

    default:
      throw new DbError(`function public.${fn} does not exist`, "42883");
  }
}

// ---------- auth.admin ----------
export function runAdmin(db: DB, fn: string, a: Row, ctx: Ctx): any {
  switch (fn) {
    case "createUser": {
      const email = String(a.email ?? "").toLowerCase();
      if (db.authUsers.some((u) => u.email === email)) throw new DbError("A user with this email address has already been registered", "email_exists");
      const id = ctx.newId();
      db.authUsers.push({ id, email });
      insertRows(db, "profiles", [{ id, nome: a.user_metadata?.nome ?? email, role: a.user_metadata?.role ?? "staff" }], ctx);
      return { user: { id, email } };
    }
    case "deleteUser":
      deleteRows(db, "profiles", [{ c: "id", o: "eq", v: a.id }], ctx);
      db.authUsers = db.authUsers.filter((u) => u.id !== a.id);
      return { user: null };
    case "updateUserById":
      return { user: db.authUsers.find((u) => u.id === a.id) ?? null };
    default:
      return null;
  }
}

// ---------- aplicar uma operação (usado ao vivo e no replay do cookie) ----------
export function applyOp(db: DB, op: Op, ctx: Ctx): { rows?: Row[]; result?: any } {
  switch (op.k) {
    case "ins": return { rows: insertRows(db, op.t, op.rows, ctx) };
    case "upd": return { rows: updateRows(db, op.t, op.f, op.v, ctx) };
    case "ups": return { rows: upsertRows(db, op.t, op.rows, op.oc, ctx) };
    case "del": return { rows: deleteRows(db, op.t, op.f, ctx) };
    case "rpc": return { result: runRpc(db, op.fn, op.a, ctx) };
    case "adm": return { result: runAdmin(db, op.fn, op.a, ctx) };
  }
}

// Executa a operação numa cópia: se der erro no meio, nada fica pela metade.
export function applyAtomic(db: DB, op: Op, ctx: Ctx) {
  const draft: DB = structuredClone(db);
  const out = applyOp(draft, op, ctx);
  db.tables = draft.tables;
  db.authUsers = draft.authUsers;
  return out;
}
