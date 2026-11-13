import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { taxaEfetivaComanda } from "@/lib/taxas";
import { addDias, hojeSP } from "@/lib/data";
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
};
type ComandaRow = {
  data: string;
  total: number;
  pagamentos: Pagamento[];
  comanda_itens: ItemRow[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; status?: StatusFiltro }>;
}) {
  const { de: deParam, ate: ateParam, status: statusParam } = await searchParams;
  const de = deParam || isoDaysAgo(7);
  const ate = ateParam || isoDaysAgo(0);
  const statusFiltro: StatusFiltro =
    statusParam === "pago" || statusParam === "todos" ? statusParam : "pendente";

  const supabase = await createClient();
  const [profile, { data: comandas }, { data: profissionais }, { data: servicos }, { data: taxas }] =
    await Promise.all([
      getCurrentProfile(),
      supabase
        .from("comandas")
        .select(
          "data, total, pagamentos, comanda_itens(id, servico, valor, profissional_id, comissao_pago_em, comissao_valor_pago)"
        )
        .gte("data", de)
        .lte("data", ate) as unknown as Promise<{ data: ComandaRow[] | null }>,
      supabase.from("profiles").select("*").order("nome") as unknown as Promise<{
        data: Profile[] | null;
      }>,
      supabase.from("servicos").select("*") as unknown as Promise<{
        data: Servico[] | null;
      }>,
      supabase.from("taxas_cartao").select("*") as unknown as Promise<{
        data: TaxaCartao[] | null;
      }>,
    ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  const nomesPorId = new Map((profissionais ?? []).map((p) => [p.id, p.nome]));
  const taxaPorServico = new Map(
    (servicos ?? []).map((s) => [s.nome, s.comissao_percentual / 100])
  );
  const taxaComissao = (servico: string) => taxaPorServico.get(servico) ?? COMISSAO_PADRAO;
  // Proprietárias: a parte do salão não é descontada delas.
  const isentas = new Set((profissionais ?? []).filter((p) => p.isenta_parte_salao).map((p) => p.id));
  const taxasCartao = taxas ?? [];

  const porProfissional = new Map<
    string,
    {
      id: string;
      nome: string;
      totalServicos: number;
      taxaCartao: number;
      parteSalao: number;
      parteProfissional: number;
      qtd: number;
    }
  >();

  for (const comanda of comandas ?? []) {
    const taxaEfetiva = taxaEfetivaComanda(comanda.pagamentos ?? [], comanda.total, taxasCartao);
    for (const item of comanda.comanda_itens) {
      if (!item.profissional_id) continue;

      // Filtro de status por item.
      if (statusFiltro === "pendente" && item.comissao_pago_em !== null) continue;
      if (statusFiltro === "pago" && item.comissao_pago_em === null) continue;

      const nome = nomesPorId.get(item.profissional_id) ?? "—";
      const atual = porProfissional.get(item.profissional_id) ?? {
        id: item.profissional_id,
        nome,
        totalServicos: 0,
        taxaCartao: 0,
        parteSalao: 0,
        parteProfissional: 0,
        qtd: 0,
      };
      const taxaItem = item.valor * taxaEfetiva;
      const valorLiquido = item.valor - taxaItem;
      const parteSalao = isentas.has(item.profissional_id)
        ? 0
        : valorLiquido * taxaComissao(item.servico);
      const parteProfissional =
        item.comissao_valor_pago ?? valorLiquido - parteSalao;

      atual.totalServicos += item.valor;
      atual.taxaCartao += taxaItem;
      atual.parteSalao += parteSalao;
      atual.parteProfissional += parteProfissional;
      atual.qtd += 1;
      porProfissional.set(item.profissional_id, atual);
    }
  }

  const linhas = Array.from(porProfissional.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome)
  );

  const totalSalao = linhas.reduce((soma, l) => soma + l.parteSalao, 0);
  const totalTaxaCartao = linhas.reduce((soma, l) => soma + l.taxaCartao, 0);
  const totalFuncionarias = linhas.reduce((soma, l) => soma + l.parteProfissional, 0);

  const tituloStatus =
    statusFiltro === "pendente"
      ? "pendentes"
      : statusFiltro === "pago"
      ? "já pagas"
      : "todas";

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Comissões</h1>
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Mostrando:</span>
          {(
            [
              { valor: "pendente" as const, rotulo: "Pendentes" },
              { valor: "pago" as const, rotulo: "Já pagas" },
              { valor: "todos" as const, rotulo: "Tudo" },
            ]
          ).map((op) => (
            <Link
              key={op.valor}
              href={`/comissoes?de=${de}&ate=${ate}&status=${op.valor}`}
              className={`rounded-lg border px-3 py-1 text-sm transition-colors ${
                statusFiltro === op.valor
                  ? "border-accent-2/40 bg-accent-2/10 text-accent-2"
                  : "border-border text-muted hover:border-accent-2 hover:text-accent-2"
              }`}
            >
              {op.rotulo}
            </Link>
          ))}
        </div>

        <p className="mt-3 text-sm text-muted">
          Comissões {tituloStatus} no período. Comissão de cada serviço definida em{" "}
          <a href="/admin/servicos" className="underline hover:text-accent-2">
            Serviços
          </a>
          . Taxa da maquininha (
          <a href="/admin/taxas" className="underline hover:text-accent-2">
            configurar
          </a>
          ) já descontada proporcionalmente. Clique numa profissional pra registrar
          o pagamento.
        </p>

        {/* Mobile: cards */}
        <div className="mt-6 space-y-2 sm:hidden">
          {linhas.map((l) => (
            <Link
              key={l.nome}
              href={`/comissoes/${l.id}?de=${de}&ate=${ate}&status=${statusFiltro}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card-hover"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{l.nome}</span>
                <span className="text-sm text-muted">{l.qtd} serviços</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-background px-3 py-2">
                <span className="text-sm text-muted">Profissional</span>
                <span className="font-medium text-accent-2">{brl(l.parteProfissional)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between rounded-lg bg-background px-3 py-2">
                <span className="text-sm text-muted">Salão</span>
                <span className="font-medium text-foreground">{brl(l.parteSalao)}</span>
              </div>
              {l.taxaCartao > 0 && (
                <div className="mt-1 flex items-center justify-between rounded-lg bg-background px-3 py-2">
                  <span className="text-sm text-muted">Taxa cartão</span>
                  <span className="font-medium text-danger/80">-{brl(l.taxaCartao)}</span>
                </div>
              )}
            </Link>
          ))}
          {linhas.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhuma comissão {tituloStatus} no período.
            </div>
          )}
          {linhas.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-4 font-semibold">
              <div className="flex items-center justify-between">
                <span>Total funcionárias</span>
                <span className="text-accent-2">{brl(totalFuncionarias)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Total salão</span>
                <span>{brl(totalSalao)}</span>
              </div>
              {totalTaxaCartao > 0 && (
                <div className="mt-1 flex items-center justify-between text-danger/80">
                  <span>Total taxa cartão</span>
                  <span>-{brl(totalTaxaCartao)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Profissional</th>
                  <th className="px-4 py-2 font-medium">Serviços</th>
                  <th className="px-4 py-2 font-medium">Taxa cartão</th>
                  <th className="px-4 py-2 font-medium">Profissional</th>
                  <th className="px-4 py-2 font-medium">Salão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((l) => (
                  <tr key={l.nome} className="transition-colors hover:bg-card-hover">
                    <td className="px-4 py-2">
                      <Link
                        href={`/comissoes/${l.id}?de=${de}&ate=${ate}&status=${statusFiltro}`}
                        className="block"
                      >
                        {l.nome}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      <Link
                        href={`/comissoes/${l.id}?de=${de}&ate=${ate}&status=${statusFiltro}`}
                        className="block"
                      >
                        {l.qtd}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-danger/80">
                      <Link
                        href={`/comissoes/${l.id}?de=${de}&ate=${ate}&status=${statusFiltro}`}
                        className="block"
                      >
                        {l.taxaCartao > 0 ? `-${brl(l.taxaCartao)}` : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium text-accent-2">
                      <Link
                        href={`/comissoes/${l.id}?de=${de}&ate=${ate}&status=${statusFiltro}`}
                        className="block"
                      >
                        {brl(l.parteProfissional)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium">
                      <Link
                        href={`/comissoes/${l.id}?de=${de}&ate=${ate}&status=${statusFiltro}`}
                        className="block"
                      >
                        {brl(l.parteSalao)}
                      </Link>
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      Nenhuma comissão {tituloStatus} no período.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-background font-semibold">
                  <td className="px-4 py-2" colSpan={2}>
                    TOTAL
                  </td>
                  <td className="px-4 py-2 text-danger/80">
                    {totalTaxaCartao > 0 ? `-${brl(totalTaxaCartao)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-accent-2">{brl(totalFuncionarias)}</td>
                  <td className="px-4 py-2">{brl(totalSalao)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
