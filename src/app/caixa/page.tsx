import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { brl, buscarCaixaAberto } from "@/lib/caixa";
import { podeGerenciarCaixa } from "@/lib/permissoes";
import {
  AbrirCaixaForm,
  EstornarButton,
  FecharCaixaForm,
  MovimentoForm,
  SaidaForm,
} from "./CaixaForms";
import type { CaixaMovimento, CaixaResumo, CaixaSessao } from "@/lib/types";

const TIPO_LABEL: Record<string, string> = {
  suprimento: "Suprimento",
  sangria: "Sangria",
  ajuste: "Ajuste",
  estorno: "Estorno",
  despesa: "Saída",
  comissao: "Comissão paga",
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

type DespesaCaixa = {
  id: string;
  descricao: string;
  valor: number;
  created_at: string;
  categoria: { nome: string; sistema_chave: string | null } | null;
};

type Pendencia = { comanda_id: string; cliente_nome: string | null; total: number; pago: number };

type Lancamento = {
  id: string;
  quando: string;
  tipo: string;
  descricao: string;
  efeito: number;
  movimentoId?: string;
  estornado?: boolean;
};

export default async function CaixaPage() {
  const supabase = await createClient();
  const [profile, caixa] = await Promise.all([getCurrentProfile(), buscarCaixaAberto(supabase)]);
  if (!profile) redirect("/login");
  if (!podeGerenciarCaixa(profile)) redirect("/");

  if (!caixa) {
    const { data: ultimo } = (await supabase
      .from("caixa_sessoes")
      .select("*")
      .neq("status", "aberto")
      .order("fechado_em", { ascending: false })
      .limit(1)
      .maybeSingle()) as unknown as { data: CaixaSessao | null };

    return (
      <div className="flex flex-1 flex-col">
        <Header profile={profile} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Caixa</h1>
            <Link href="/caixa/historico" className="text-sm text-muted hover:text-accent-2">
              Histórico de caixas →
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted">
            O caixa está fechado. Conte o dinheiro da gaveta e abra para começar a lançar
            comandas.
          </p>
          <div className="mt-6">
            <AbrirCaixaForm fundoEsperado={ultimo ? Number(ultimo.fundo_deixado ?? 0) : null} />
          </div>
        </main>
      </div>
    );
  }

  const [
    { data: movimentos },
    { data: despesas },
    { data: pendencias },
    { data: abridor },
    resumoResp,
    { data: categorias },
  ] = await Promise.all([
    supabase
      .from("caixa_movimentos")
      .select("*")
      .eq("sessao_id", caixa.id)
      .order("created_at", { ascending: false }) as unknown as Promise<{
      data: CaixaMovimento[] | null;
    }>,
    supabase
      .from("despesas")
      .select("id, descricao, valor, created_at, categoria:categoria_id(nome, sistema_chave)")
      .eq("caixa_sessao_id", caixa.id) as unknown as Promise<{ data: DespesaCaixa[] | null }>,
    supabase.rpc("caixa_pendencias", { p_sessao_id: caixa.id }) as unknown as Promise<{
      data: Pendencia[] | null;
    }>,
    supabase.from("profiles").select("nome").eq("id", caixa.aberto_por).maybeSingle(),
    supabase.rpc("caixa_resumo", { p_sessao_id: caixa.id }) as unknown as Promise<{
      data: CaixaResumo | null;
    }>,
    supabase
      .from("despesa_categorias")
      .select("id, nome, ordem, grupo:grupo_id(nome, ordem)")
      .eq("ativa", true)
      .is("sistema_chave", null)
      .order("ordem") as unknown as Promise<{
      data: { id: string; nome: string; ordem: number; grupo: { nome: string; ordem: number } }[] | null;
    }>,
  ]);

  const resumo = resumoResp.data;
  const estornados = new Set((movimentos ?? []).map((m) => m.estorna_id).filter(Boolean));

  const lancamentos: Lancamento[] = [
    ...(movimentos ?? []).map((m) => ({
      id: m.id,
      quando: m.created_at,
      tipo: m.tipo,
      descricao: m.descricao,
      efeito: m.sentido === "entrada" ? Number(m.valor) : -Number(m.valor),
      movimentoId: m.tipo !== "estorno" ? m.id : undefined,
      estornado: estornados.has(m.id),
    })),
    ...(despesas ?? []).map((d) => ({
      id: d.id,
      quando: d.created_at,
      tipo: d.categoria?.sistema_chave === "comissoes_pagas" ? "comissao" : "despesa",
      descricao: d.categoria ? `${d.descricao} · ${d.categoria.nome}` : d.descricao,
      efeito: -Number(d.valor),
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando));

  const cats = (categorias ?? [])
    .sort((a, b) => a.grupo.ordem - b.grupo.ordem || a.ordem - b.ordem)
    .map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo.nome }));

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Caixa aberto</h1>
            <p className="mt-1 text-sm text-muted">
              Desde {hora(caixa.aberto_em)} de{" "}
              {new Date(caixa.data_operacional + "T00:00:00").toLocaleDateString("pt-BR")}
              {abridor?.nome ? ` · aberto por ${abridor.nome}` : ""} · troco inicial{" "}
              {brl(Number(caixa.fundo_contado))}
            </p>
          </div>
          <Link href="/caixa/historico" className="text-sm text-muted hover:text-accent-2">
            Histórico de caixas →
          </Link>
        </div>

        {resumo && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-xl border border-accent-2/30 bg-accent-2/5 p-3 text-center sm:p-4">
              <div className="text-xs text-muted sm:text-sm">Deve ter na gaveta</div>
              <div className="mt-1 font-semibold text-accent-2">{brl(Number(resumo.esperado_dinheiro))}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
              <div className="text-xs text-muted sm:text-sm">Cartão</div>
              <div className="mt-1 font-semibold text-foreground">{brl(Number(resumo.esperado_cartao))}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
              <div className="text-xs text-muted sm:text-sm">Pix</div>
              <div className="mt-1 font-semibold text-foreground">{brl(Number(resumo.esperado_pix))}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
              <div className="text-xs text-muted sm:text-sm">Comandas</div>
              <div className="mt-1 font-semibold text-foreground">{resumo.qtd_comandas}</div>
            </div>
            <p className="col-span-full text-xs text-muted">
              Entrou em dinheiro {brl(Number(resumo.comandas_dinheiro))}
              {Number(resumo.troco_dado) > 0 && ` (troco dado ${brl(Number(resumo.troco_dado))})`}
              {Number(resumo.recebido_duplicatas) > 0 &&
                ` · recebido de duplicatas ${brl(Number(resumo.recebido_duplicatas))}`}
              .
            </p>
          </div>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-medium text-foreground">Lançamentos da gaveta</h2>
          <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-card">
            {lancamentos.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">
                Nenhum suprimento, sangria ou saída ainda. Pagamentos das comandas entram
                sozinhos.
              </p>
            )}
            <ul className="divide-y divide-border">
              {lancamentos.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className={`truncate ${l.estornado ? "text-muted line-through" : "text-foreground"}`}>
                      {TIPO_LABEL[l.tipo] ?? l.tipo} · {l.descricao}
                    </div>
                    <div className="text-xs text-muted">{hora(l.quando)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={l.efeito >= 0 ? "text-accent-2" : "text-danger/80"}>
                      {l.efeito >= 0 ? "+" : "−"}
                      {brl(Math.abs(l.efeito))}
                    </span>
                    {l.movimentoId && !l.estornado && (
                      <EstornarButton movimentoId={l.movimentoId} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-foreground">Pagar algo com o dinheiro do caixa</h2>
            <p className="mt-0.5 text-xs text-muted">
              Ex: refrigerante, material. Desconta da gaveta e entra em Despesas.
            </p>
            <div className="mt-3">
              <SaidaForm categorias={cats} />
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-foreground">Movimentar a gaveta</h2>
            <p className="mt-0.5 text-xs text-muted">
              Suprimento põe troco; sangria tira pro cofre/banco; ajuste corrige diferença.
            </p>
            <div className="mt-3">
              <MovimentoForm />
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-foreground">Fechar o caixa</h2>
          <p className="mt-0.5 text-xs text-muted">
            Conte o dinheiro da gaveta e confira os totais da maquininha e do Pix. O sistema
            compara com o que deveria ter e guarda a diferença para a administração conferir.
          </p>
          {(pendencias ?? []).length > 0 && (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm">
              <div className="font-medium text-danger">
                Comandas com pagamento em aberto (vão para Duplicatas):
              </div>
              <ul className="mt-1 space-y-0.5 text-muted">
                {(pendencias ?? []).map((p) => (
                  <li key={p.comanda_id}>
                    <Link href={`/comandas/${p.comanda_id}`} className="hover:text-accent-2">
                      {p.cliente_nome || "Sem nome"} — falta {brl(Number(p.total) - Number(p.pago))}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3">
            <FecharCaixaForm />
          </div>
        </section>
      </main>
    </div>
  );
}
