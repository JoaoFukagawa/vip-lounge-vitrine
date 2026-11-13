import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { taxaEfetivaComanda } from "@/lib/taxas";
import { addDias, hojeSP } from "@/lib/data";
import { RegistrarPagamentoComissao } from "../RegistrarPagamentoComissao";
import type { Pagamento, Profile, Servico, TaxaCartao } from "@/lib/types";

const COMISSAO_PADRAO = 0.3;

function isoDaysAgo(n: number) {
  return addDias(hojeSP(), -n);
}

type StatusFiltro = "pendente" | "pago" | "todos";

type ItemRow = {
  id: string;
  servico: string;
  valor: number;
  profissional_id: string | null;
  comissao_pago_em: string | null;
  comissao_valor_pago: number | null;
  comissao_despesa_id: string | null;
};
type ComandaRow = {
  id: string;
  data: string;
  cliente_nome: string | null;
  total: number;
  pagamentos: Pagamento[];
  comanda_itens: ItemRow[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ComissoesProfissionalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ de?: string; ate?: string; status?: StatusFiltro }>;
}) {
  const { id } = await params;
  const { de: deParam, ate: ateParam, status: statusParam } = await searchParams;
  const de = deParam || isoDaysAgo(7);
  const ate = ateParam || isoDaysAgo(0);
  const statusFiltro: StatusFiltro = statusParam === "pago" || statusParam === "todos"
    ? statusParam
    : "pendente";

  const supabase = await createClient();
  const [profile, { data: profissional }, { data: comandas }, { data: servicos }, { data: taxas }] =
    await Promise.all([
      getCurrentProfile(),
      supabase.from("profiles").select("*").eq("id", id).single() as unknown as Promise<{
        data: Profile | null;
      }>,
      supabase
        .from("comandas")
        .select(
          "id, data, cliente_nome, total, pagamentos, comanda_itens(id, servico, valor, profissional_id, comissao_pago_em, comissao_valor_pago, comissao_despesa_id)"
        )
        .gte("data", de)
        .lte("data", ate)
        .order("data", { ascending: false }) as unknown as Promise<{
        data: ComandaRow[] | null;
      }>,
      supabase.from("servicos").select("*") as unknown as Promise<{ data: Servico[] | null }>,
      supabase.from("taxas_cartao").select("*") as unknown as Promise<{
        data: TaxaCartao[] | null;
      }>,
    ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");
  if (!profissional) notFound();

  const taxaPorServico = new Map(
    (servicos ?? []).map((s) => [s.nome, s.comissao_percentual / 100])
  );
  const taxaComissao = (servico: string) => taxaPorServico.get(servico) ?? COMISSAO_PADRAO;
  const taxasCartao = taxas ?? [];

  const visitas = (comandas ?? [])
    .map((comanda) => {
      const taxaEfetiva = taxaEfetivaComanda(comanda.pagamentos ?? [], comanda.total, taxasCartao);
      const itens = comanda.comanda_itens
        .filter((item) => item.profissional_id === id)
        .filter((item) => {
          if (statusFiltro === "pendente") return item.comissao_pago_em === null;
          if (statusFiltro === "pago") return item.comissao_pago_em !== null;
          return true;
        })
        .map((item) => {
          const taxaCartao = item.valor * taxaEfetiva;
          const valorLiquido = item.valor - taxaCartao;
          const parteSalao = profissional.isenta_parte_salao
            ? 0
            : valorLiquido * taxaComissao(item.servico);
          // Se já foi paga, usa o snapshot; se não, calcula dinâmico.
          const parteProfissional =
            item.comissao_valor_pago ?? valorLiquido - parteSalao;
          return {
            id: item.id,
            servico: item.servico,
            valor: item.valor,
            taxaCartao,
            parteSalao,
            parteProfissional,
            pago: item.comissao_pago_em !== null,
          };
        });

      if (itens.length === 0) return null;

      return {
        comandaId: comanda.id,
        data: comanda.data,
        clienteNome: comanda.cliente_nome || "—",
        itens,
        valorTotal: itens.reduce((soma, i) => soma + i.valor, 0),
        taxaCartaoTotal: itens.reduce((soma, i) => soma + i.taxaCartao, 0),
        parteSalaoTotal: itens.reduce((soma, i) => soma + i.parteSalao, 0),
        parteProfissionalTotal: itens.reduce((soma, i) => soma + i.parteProfissional, 0),
      };
    })
    .filter((v) => v !== null)
    .sort((a, b) => b.data.localeCompare(a.data));

  const totalItens = visitas.reduce((soma, v) => soma + v.itens.length, 0);
  const totalTaxaCartao = visitas.reduce((soma, v) => soma + v.taxaCartaoTotal, 0);
  const totalSalao = visitas.reduce((soma, v) => soma + v.parteSalaoTotal, 0);
  const totalProfissional = visitas.reduce((soma, v) => soma + v.parteProfissionalTotal, 0);

  const temPendencia = visitas.some((v) => v.itens.some((i) => !i.pago));

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <Link href={`/comissoes?de=${de}&ate=${ate}`} className="text-sm text-muted hover:text-accent-2">
          ← Comissões
        </Link>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">{profissional.nome}</h1>
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="status" value={statusFiltro} />
            <input
              type="date"
              name="de"
              defaultValue={de}
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2 sm:flex-none"
            />
            <span className="text-sm text-muted">até</span>
            <input
              type="date"
              name="ate"
              defaultValue={ate}
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2 sm:flex-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
            >
              Filtrar
            </button>
          </form>
        </div>

        {/* Filtro pendente/pago */}
        <div className="mt-3 flex gap-2 text-sm">
          {(
            [
              { valor: "pendente" as const, rotulo: "Pendentes" },
              { valor: "pago" as const, rotulo: "Já pagas" },
              { valor: "todos" as const, rotulo: "Tudo" },
            ]
          ).map((op) => (
            <Link
              key={op.valor}
              href={`/comissoes/${id}?de=${de}&ate=${ate}&status=${op.valor}`}
              className={`rounded-lg border px-3 py-1 transition-colors ${
                statusFiltro === op.valor
                  ? "border-accent-2/40 bg-accent-2/10 text-accent-2"
                  : "border-border text-muted hover:border-accent-2 hover:text-accent-2"
              }`}
            >
              {op.rotulo}
            </Link>
          ))}
        </div>

        {statusFiltro === "pendente" && temPendencia && (
          <div className="mt-4 rounded-2xl border border-accent-2/30 bg-accent-2/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm text-muted">Total a pagar pra {profissional.nome}</div>
                <div className="mt-0.5 text-lg font-semibold text-accent-2">
                  {brl(totalProfissional)}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {totalItens} serviço{totalItens > 1 ? "s" : ""} pendente
                  {totalItens > 1 ? "s" : ""} · {de} a {ate}
                </div>
              </div>
              <RegistrarPagamentoComissao
                profissionalId={id}
                profissionalNome={profissional.nome}
                de={de}
                ate={ate}
                totalPrevisto={totalProfissional}
                hojeISO={hojeSP()}
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Serviços</div>
            <div className="mt-1 font-semibold text-foreground">{totalItens}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Parte dela</div>
            <div className="mt-1 font-semibold text-accent-2">{brl(totalProfissional)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Parte salão</div>
            <div className="mt-1 font-semibold text-foreground">{brl(totalSalao)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Taxa cartão</div>
            <div className="mt-1 font-semibold text-danger/80">
              {totalTaxaCartao > 0 ? `-${brl(totalTaxaCartao)}` : "—"}
            </div>
          </div>
        </div>

        <h2 className="mt-6 text-sm font-medium text-foreground">
          Visitas ({visitas.length})
        </h2>
        <div className="mt-2 space-y-2">
          {visitas.map((v) => (
            <Link
              key={v.comandaId}
              href={`/comandas/${v.comandaId}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-foreground">{v.clienteNome}</span>
                  <span className="ml-2 text-sm text-muted">
                    {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <span className="shrink-0 font-medium text-accent-2">
                  {brl(v.parteProfissionalTotal)}
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {v.itens.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-sm text-muted"
                  >
                    <span>
                      {item.servico}
                      {item.pago && (
                        <span className="ml-2 rounded-full bg-accent-2/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent-2">
                          pago
                        </span>
                      )}
                    </span>
                    <span>{brl(item.valor)}</span>
                  </div>
                ))}
              </div>
              {v.taxaCartaoTotal > 0 && (
                <div className="mt-1 text-xs text-danger/80">
                  Taxa cartão: -{brl(v.taxaCartaoTotal)}
                </div>
              )}
            </Link>
          ))}
          {visitas.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              {statusFiltro === "pendente"
                ? "Nenhuma comissão pendente no período."
                : statusFiltro === "pago"
                ? "Nenhuma comissão paga no período."
                : "Nenhum atendimento no período."}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
