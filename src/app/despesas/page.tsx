import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { podeGerenciarFinanceiro } from "@/lib/permissoes";
import { hojeSP } from "@/lib/data";
import type {
  Despesa,
  DespesaCategoriaComGrupo,
  DespesaStatus,
} from "@/lib/types";

type DespesaJoinada = Despesa & {
  categoria: {
    id: string;
    nome: string;
    grupo: { id: string; nome: string };
  } | null;
};

function inicioDoMes(iso: string) {
  return iso.slice(0, 7) + "-01";
}

function fimDoMes(iso: string) {
  const [ano, mes] = iso.slice(0, 7).split("-").map(Number);
  // Último dia do mês: dia 0 do próximo mês
  const ultimo = new Date(Date.UTC(ano, mes, 0));
  const mm = String(ultimo.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ultimo.getUTCDate()).padStart(2, "0");
  return `${ano}-${mm}-${dd}`;
}

function labelMes(mesYYYYMM: string) {
  const [ano, mes] = mesYYYYMM.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, 1));
  return data.toLocaleString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; categoria?: string; status?: DespesaStatus | "" }>;
}) {
  const { mes: mesParam, categoria: categoriaParam, status: statusParam } = await searchParams;
  const mes = (mesParam || hojeSP()).slice(0, 7);
  const de = inicioDoMes(mes + "-01");
  const ate = fimDoMes(mes + "-01");

  const supabase = await createClient();

  const consultaDespesas = supabase
    .from("despesas")
    .select("*, categoria:categoria_id(id, nome, grupo:grupo_id(id, nome))")
    .gte("data", de)
    .lte("data", ate);

  const [profile, { data: despesas }, { data: categorias }] = await Promise.all([
    getCurrentProfile(),
    (categoriaParam
      ? consultaDespesas.eq("categoria_id", categoriaParam)
      : consultaDespesas
    ).order("data", { ascending: false }) as unknown as Promise<{
      data: DespesaJoinada[] | null;
    }>,
    supabase
      .from("despesa_categorias")
      .select("*, grupo:grupo_id(id, nome, ordem)")
      .order("ordem") as unknown as Promise<{ data: DespesaCategoriaComGrupo[] | null }>,
  ]);

  if (!profile) redirect("/login");
  if (!podeGerenciarFinanceiro(profile)) redirect("/");

  const cats = (categorias ?? []).sort(
    (a, b) => a.grupo.ordem - b.grupo.ordem || a.ordem - b.ordem
  );

  const lista = (despesas ?? []).filter((d) =>
    statusParam ? d.status === statusParam : true
  );

  const totalPago = lista.filter((d) => d.status === "pago").reduce((s, d) => s + d.valor, 0);
  const totalAPagar = lista
    .filter((d) => d.status === "a_pagar")
    .reduce((s, d) => s + d.valor, 0);

  const porGrupo = new Map<string, { nome: string; total: number }>();
  for (const d of lista) {
    if (d.status !== "pago") continue;
    const g = d.categoria?.grupo;
    if (!g) continue;
    const atual = porGrupo.get(g.id) ?? { nome: g.nome, total: 0 };
    atual.total += d.valor;
    porGrupo.set(g.id, atual);
  }
  const grupoRanking = Array.from(porGrupo.values()).sort((a, b) => b.total - a.total);

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Despesas</h1>
            <p className="mt-1 text-sm text-muted capitalize">{labelMes(mes)}</p>
          </div>
          <Link
            href="/despesas/nova"
            className="brand-gradient glow-accent shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Nova despesa
          </Link>
        </div>

        {/* Filtros */}
        <form className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-muted">Mês</label>
            <input
              type="month"
              name="mes"
              defaultValue={mes}
              className="mt-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
            />
          </div>
          <div>
            <label className="block text-xs text-muted">Categoria</label>
            <select
              name="categoria"
              defaultValue={categoriaParam ?? ""}
              className="mt-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
            >
              <option value="">Todas</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grupo.nome} · {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted">Status</label>
            <select
              name="status"
              defaultValue={statusParam ?? ""}
              className="mt-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
            >
              <option value="">Todos</option>
              <option value="pago">Pagas</option>
              <option value="a_pagar">A pagar</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
          >
            Filtrar
          </button>
          {(categoriaParam || statusParam || mesParam) && (
            <Link
              href="/despesas"
              className="text-sm text-muted transition-colors hover:text-accent-2"
            >
              Limpar
            </Link>
          )}
        </form>

        {/* Resumo do mês */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Pagas no mês</div>
            <div className="mt-1 font-semibold text-foreground">{brl(totalPago)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">A pagar</div>
            <div className="mt-1 font-semibold text-danger/80">
              {totalAPagar > 0 ? brl(totalAPagar) : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Lançamentos</div>
            <div className="mt-1 font-semibold text-foreground">{lista.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Total geral</div>
            <div className="mt-1 font-semibold text-accent-2">{brl(totalPago + totalAPagar)}</div>
          </div>
        </div>

        {/* Onde foi o dinheiro (por grupo) */}
        {grupoRanking.length > 0 && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <div className="text-sm font-medium text-foreground">
              Pra onde foi o dinheiro (só pagas)
            </div>
            <div className="mt-2 space-y-1.5">
              {grupoRanking.map((g) => {
                const pct = totalPago > 0 ? Math.round((g.total / totalPago) * 100) : 0;
                return (
                  <div key={g.nome}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">{g.nome}</span>
                      <span className="text-foreground">
                        {brl(g.total)} <span className="text-xs text-muted">({pct}%)</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
                      <div
                        className="h-full bg-accent-2/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile: cards */}
        <div className="mt-6 space-y-2 sm:hidden">
          {lista.map((d) => (
            <Link
              key={d.id}
              href={`/despesas/${d.id}`}
              className={`block rounded-xl border p-4 transition-colors hover:bg-card-hover ${
                d.status === "a_pagar"
                  ? "border-danger/30 bg-danger/5"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">{d.descricao}</span>
                <span className="shrink-0 font-medium text-foreground">{brl(d.valor)}</span>
              </div>
              <div className="mt-1 text-sm text-muted">
                {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR")}
                {d.categoria && ` · ${d.categoria.nome}`}
                {d.status === "a_pagar" && d.data_vencimento && (
                  <span className="text-danger">
                    {" · vence "}
                    {new Date(d.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            </Link>
          ))}
          {lista.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhuma despesa nesse período.
            </div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Descrição</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map((d) => (
                  <tr key={d.id} className="transition-colors hover:bg-card-hover">
                    <td className="px-4 py-2">
                      <Link href={`/despesas/${d.id}`} className="block">
                        {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/despesas/${d.id}`} className="block">
                        {d.descricao}
                        {d.fornecedor && (
                          <span className="text-muted"> · {d.fornecedor}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      <Link href={`/despesas/${d.id}`} className="block">
                        {d.categoria ? (
                          <>
                            <span className="text-xs">{d.categoria.grupo.nome}</span>
                            <br />
                            <span>{d.categoria.nome}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/despesas/${d.id}`} className="block">
                        {d.status === "pago" ? (
                          <span className="rounded-full bg-accent-2/10 px-2 py-0.5 text-xs text-accent-2">
                            Paga
                          </span>
                        ) : (
                          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                            Vence{" "}
                            {d.data_vencimento
                              ? new Date(d.data_vencimento + "T00:00:00").toLocaleDateString(
                                  "pt-BR"
                                )
                              : "—"}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium text-foreground">
                      <Link href={`/despesas/${d.id}`} className="block">
                        {brl(d.valor)}
                      </Link>
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      Nenhuma despesa nesse período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
