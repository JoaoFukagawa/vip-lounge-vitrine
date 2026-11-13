import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { taxaCartaoValor, taxaEfetivaComanda } from "@/lib/taxas";
import { hojeSP } from "@/lib/data";
import type { Despesa, Pagamento, Servico, TaxaCartao } from "@/lib/types";

const COMISSAO_PADRAO = 0.3;

type ComandaRow = {
  data: string;
  total: number;
  pagamentos: Pagamento[];
  comanda_itens: {
    servico: string;
    valor: number;
    profissional_id: string | null;
    comissao_pago_em: string | null;
    comissao_valor_pago: number | null;
  }[];
};

type LinhaDia = {
  data: string;
  dinheiro: number;
  pix: number;
  cartaoDebito: number;
  cartaoCredito: number;
  taxaCartao: number;
  bruto: number;
  liquido: number;
};

type DespesaComCategoria = Despesa & {
  categoria: { id: string; nome: string; sistema_chave: string | null } | null;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const { de: deParam, ate: ateParam } = await searchParams;
  const hoje = hojeSP();
  // Padrão: mês corrente (útil pra ver o resumo mensal de entradas vs saídas).
  const primeiroDoMes = hoje.slice(0, 8) + "01";
  const de = deParam || primeiroDoMes;
  const ate = ateParam || hoje;

  const supabase = await createClient();
  const [
    profile,
    { data: comandas },
    { data: taxas },
    { data: servicos },
    { data: despesas },
    { data: proprietarias },
  ] =
    await Promise.all([
      getCurrentProfile(),
      supabase
        .from("comandas")
        .select(
          "data, total, pagamentos, comanda_itens(servico, valor, profissional_id, comissao_pago_em, comissao_valor_pago)"
        )
        .gte("data", de)
        .lte("data", ate)
        .order("data", { ascending: false }) as unknown as Promise<{ data: ComandaRow[] | null }>,
      supabase.from("taxas_cartao").select("*") as unknown as Promise<{
        data: TaxaCartao[] | null;
      }>,
      supabase.from("servicos").select("*") as unknown as Promise<{ data: Servico[] | null }>,
      supabase
        .from("despesas")
        .select("*, categoria:categoria_id(id, nome, sistema_chave)")
        .gte("data", de)
        .lte("data", ate)
        .eq("status", "pago") as unknown as Promise<{ data: DespesaComCategoria[] | null }>,
      supabase.from("profiles").select("id").eq("isenta_parte_salao", true) as unknown as Promise<{
        data: { id: string }[] | null;
      }>,
    ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  const taxasCartao = taxas ?? [];
  const taxaPorServico = new Map(
    (servicos ?? []).map((s) => [s.nome, s.comissao_percentual / 100])
  );
  const taxaComissao = (servico: string) => taxaPorServico.get(servico) ?? COMISSAO_PADRAO;
  // Proprietárias: a parte do salão não é descontada delas.
  const isentas = new Set((proprietarias ?? []).map((p) => p.id));

  const porDia = new Map<string, LinhaDia>();
  let comissoesPendentes = 0;

  for (const comanda of comandas ?? []) {
    const linha = porDia.get(comanda.data) ?? {
      data: comanda.data,
      dinheiro: 0,
      pix: 0,
      cartaoDebito: 0,
      cartaoCredito: 0,
      taxaCartao: 0,
      bruto: 0,
      liquido: 0,
    };

    linha.bruto += comanda.total;
    linha.taxaCartao += taxaCartaoValor(comanda.pagamentos ?? [], taxasCartao);

    for (const p of comanda.pagamentos ?? []) {
      if (p.forma === "dinheiro") linha.dinheiro += p.valor;
      else if (p.forma === "pix") linha.pix += p.valor;
      else if (p.forma === "cartao" && p.tipo_cartao === "debito") linha.cartaoDebito += p.valor;
      else if (p.forma === "cartao" && p.tipo_cartao === "credito") linha.cartaoCredito += p.valor;
      else if (p.forma === "cartao") linha.cartaoCredito += p.valor;
    }

    porDia.set(comanda.data, linha);

    // Comissões pendentes previstas — dinheiro que ainda vai sair pra profissionais
    // se ela lançar essa comanda mas não registrar pagamento.
    const taxaEfetiva = taxaEfetivaComanda(comanda.pagamentos ?? [], comanda.total, taxasCartao);
    for (const item of comanda.comanda_itens) {
      if (item.comissao_pago_em !== null) continue;
      if (!item.profissional_id) continue;
      const taxaItem = item.valor * taxaEfetiva;
      const liquido = item.valor - taxaItem;
      comissoesPendentes += isentas.has(item.profissional_id)
        ? liquido
        : liquido - liquido * taxaComissao(item.servico);
    }
  }

  const linhas = Array.from(porDia.values())
    .map((l) => ({ ...l, liquido: l.bruto - l.taxaCartao }))
    .sort((a, b) => b.data.localeCompare(a.data));

  const totalBruto = linhas.reduce((s, l) => s + l.bruto, 0);
  const totalTaxa = linhas.reduce((s, l) => s + l.taxaCartao, 0);
  const totalLiquido = linhas.reduce((s, l) => s + l.liquido, 0);
  const totalDinheiro = linhas.reduce((s, l) => s + l.dinheiro, 0);
  const totalPix = linhas.reduce((s, l) => s + l.pix, 0);
  const totalCartaoDebito = linhas.reduce((s, l) => s + l.cartaoDebito, 0);
  const totalCartaoCredito = linhas.reduce((s, l) => s + l.cartaoCredito, 0);

  const despesasPagas = despesas ?? [];
  const comissoesPagas = despesasPagas
    .filter((d) => d.categoria?.sistema_chave === "comissoes_pagas")
    .reduce((s, d) => s + d.valor, 0);
  const outrasDespesas = despesasPagas
    .filter((d) => d.categoria?.sistema_chave !== "comissoes_pagas")
    .reduce((s, d) => s + d.valor, 0);
  const totalComissoes = comissoesPagas + comissoesPendentes;
  const lucroEstimado = totalLiquido - totalComissoes - outrasDespesas;

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Financeiro</h1>
          <form className="flex flex-wrap items-center gap-2">
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

        {/* Resumo do período — entrou x saiu x lucro estimado */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="text-sm font-medium text-foreground">Resumo do período</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-xs text-muted">Receita bruta</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{brl(totalBruto)}</div>
              <div className="mt-0.5 text-xs text-muted">
                {comandas?.length ?? 0} comanda{(comandas?.length ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-xs text-muted">Taxa cartão</div>
              <div className="mt-1 text-lg font-semibold text-danger/80">
                {totalTaxa > 0 ? `-${brl(totalTaxa)}` : "—"}
              </div>
              <div className="mt-0.5 text-xs text-muted">já descontada</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-xs text-muted">Comissões</div>
              <div className="mt-1 text-lg font-semibold text-danger/80">
                -{brl(totalComissoes)}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {brl(comissoesPagas)} pagas + {brl(comissoesPendentes)} pendentes
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-xs text-muted">Outras despesas</div>
              <div className="mt-1 text-lg font-semibold text-danger/80">
                {outrasDespesas > 0 ? `-${brl(outrasDespesas)}` : "—"}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                <Link href="/despesas" className="underline hover:text-accent-2">
                  ver detalhe
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-accent-2/30 bg-accent-2/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs text-muted">Lucro estimado</div>
              <div className="mt-0.5 text-xs text-muted">
                receita líquida − comissões − despesas
              </div>
            </div>
            <div
              className={`text-xl font-semibold ${
                lucroEstimado >= 0 ? "text-accent-2" : "text-danger"
              }`}
            >
              {brl(lucroEstimado)}
            </div>
          </div>
        </div>

        {/* Breakdown por forma de pagamento */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <span className="text-muted">Dinheiro</span>{" "}
            <span className="font-medium text-foreground">{brl(totalDinheiro)}</span>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <span className="text-muted">PIX</span>{" "}
            <span className="font-medium text-foreground">{brl(totalPix)}</span>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <span className="text-muted">Cartão débito</span>{" "}
            <span className="font-medium text-foreground">{brl(totalCartaoDebito)}</span>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <span className="text-muted">Cartão crédito</span>{" "}
            <span className="font-medium text-foreground">{brl(totalCartaoCredito)}</span>
          </div>
        </div>

        {/* Mobile: cards por dia */}
        <div className="mt-6 space-y-2 sm:hidden">
          {linhas.map((l) => (
            <div key={l.data} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR")}
                </span>
                <span className="font-medium text-accent-2">{brl(l.liquido)}</span>
              </div>
              <div className="mt-1 text-sm text-muted">
                Bruto {brl(l.bruto)}
                {l.taxaCartao > 0 && ` · taxa -${brl(l.taxaCartao)}`}
              </div>
            </div>
          ))}
          {linhas.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhuma comanda no período.
            </div>
          )}
        </div>

        {/* Desktop: tabela por dia */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Dinheiro</th>
                  <th className="px-4 py-2 font-medium">PIX</th>
                  <th className="px-4 py-2 font-medium">Débito</th>
                  <th className="px-4 py-2 font-medium">Crédito</th>
                  <th className="px-4 py-2 font-medium">Taxa</th>
                  <th className="px-4 py-2 font-medium">Líquido do dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((l) => (
                  <tr key={l.data} className="transition-colors hover:bg-card-hover">
                    <td className="px-4 py-2">
                      {new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-2 text-muted">{brl(l.dinheiro)}</td>
                    <td className="px-4 py-2 text-muted">{brl(l.pix)}</td>
                    <td className="px-4 py-2 text-muted">{brl(l.cartaoDebito)}</td>
                    <td className="px-4 py-2 text-muted">{brl(l.cartaoCredito)}</td>
                    <td className="px-4 py-2 text-danger/80">
                      {l.taxaCartao > 0 ? `-${brl(l.taxaCartao)}` : "—"}
                    </td>
                    <td className="px-4 py-2 font-medium text-accent-2">{brl(l.liquido)}</td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted">
                      Nenhuma comanda no período.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-background font-semibold">
                  <td className="px-4 py-2">TOTAL</td>
                  <td className="px-4 py-2">{brl(totalDinheiro)}</td>
                  <td className="px-4 py-2">{brl(totalPix)}</td>
                  <td className="px-4 py-2">{brl(totalCartaoDebito)}</td>
                  <td className="px-4 py-2">{brl(totalCartaoCredito)}</td>
                  <td className="px-4 py-2 text-danger/80">
                    {totalTaxa > 0 ? `-${brl(totalTaxa)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-accent-2">{brl(totalLiquido)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
