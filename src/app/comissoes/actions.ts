"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/current-profile";
import { podeGerenciarFinanceiro } from "@/lib/permissoes";
import { taxaEfetivaComanda } from "@/lib/taxas";
import { buscarCaixaAberto, mensagemErro } from "@/lib/caixa";
import type { Pagamento, Profile, Servico, TaxaCartao } from "@/lib/types";

const COMISSAO_PADRAO = 0.3;

type ItemPendente = {
  id: string;
  servico: string;
  valor: number;
  comanda_id: string;
  comandas: {
    id: string;
    data: string;
    total: number;
    pagamentos: Pagamento[];
    created_at: string;
  };
};

export type ResultadoPagamento =
  | { ok: true; total: number; despesaId: string; itens: number }
  | { ok: false; erro: string };

export async function registrarPagamentoComissao(
  profissionalId: string,
  de: string,
  ate: string,
  dataPagamento: string,
  doCaixa = false
): Promise<ResultadoPagamento> {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) {
    return { ok: false, erro: "Sem permissão." };
  }

  const supabase = await createClient();

  const [
    { data: itens },
    { data: servicos },
    { data: taxas },
    { data: categoria },
    { data: profissional },
  ] = await Promise.all([
    supabase
      .from("comanda_itens")
      .select(
        "id, servico, valor, comanda_id, comandas:comanda_id(id, data, total, pagamentos, created_at)"
      )
      .eq("profissional_id", profissionalId)
      .is("comissao_pago_em", null)
      .gte("comandas.data", de)
      .lte("comandas.data", ate) as unknown as Promise<{ data: ItemPendente[] | null }>,
    supabase.from("servicos").select("*") as unknown as Promise<{
      data: Servico[] | null;
    }>,
    supabase.from("taxas_cartao").select("*") as unknown as Promise<{
      data: TaxaCartao[] | null;
    }>,
    supabase
      .from("despesa_categorias")
      .select("id, nome")
      .eq("sistema_chave", "comissoes_pagas")
      .single() as unknown as Promise<{ data: { id: string; nome: string } | null }>,
    supabase.from("profiles").select("nome, isenta_parte_salao").eq("id", profissionalId).single() as unknown as Promise<{
      data: Pick<Profile, "nome" | "isenta_parte_salao"> | null;
    }>,
  ]);

  if (!categoria) {
    return {
      ok: false,
      erro: "Categoria 'Comissões pagas' não encontrada — rode a migração 0010.",
    };
  }

  // O join comandas:comanda_id devolve `null` em `comandas` quando o filtro
  // gte/lte não bate — assim garantimos que só itens de comandas no período
  // realmente entram na conta.
  const pendentes = (itens ?? []).filter((i) => i.comandas != null);
  if (pendentes.length === 0) {
    return { ok: false, erro: "Nenhuma comissão pendente nesse período." };
  }

  const taxaPorServico = new Map(
    (servicos ?? []).map((s) => [s.nome, s.comissao_percentual / 100])
  );
  const taxaComissao = (servico: string) =>
    taxaPorServico.get(servico) ?? COMISSAO_PADRAO;
  const taxasCartao = taxas ?? [];

  let total = 0;
  const snapshots: { id: string; valor: number }[] = [];

  for (const item of pendentes) {
    const c = item.comandas;
    const taxaEfetiva = taxaEfetivaComanda(c.pagamentos ?? [], c.total, taxasCartao);
    const taxaCartao = item.valor * taxaEfetiva;
    const liquido = item.valor - taxaCartao;
    const parteSalao = profissional?.isenta_parte_salao ? 0 : liquido * taxaComissao(item.servico);
    const parteProfissional = liquido - parteSalao;
    snapshots.push({ id: item.id, valor: parteProfissional });
    total += parteProfissional;
  }

  const totalArredondado = Math.round(total * 100) / 100;
  const nomeProf = profissional?.nome ?? "profissional";

  const caixa = doCaixa ? await buscarCaixaAberto(supabase) : null;
  if (doCaixa && !caixa) {
    return { ok: false, erro: "Nenhum caixa aberto para tirar esse dinheiro." };
  }

  const { data: despesa, error: erroDespesa } = await supabase
    .from("despesas")
    .insert({
      data: dataPagamento,
      categoria_id: categoria.id,
      descricao: `Comissão de ${nomeProf} (${de} a ${ate})`,
      valor: totalArredondado,
      status: "pago",
      data_pagamento: dataPagamento,
      criado_por: requester.id,
      ...(caixa ? { forma_pagamento: "dinheiro", caixa_sessao_id: caixa.id } : {}),
    })
    .select("id")
    .single();

  if (erroDespesa || !despesa) {
    return {
      ok: false,
      erro: mensagemErro(erroDespesa, "Não foi possível criar a despesa de comissão."),
    };
  }

  const agoraISO = new Date().toISOString();
  for (const snap of snapshots) {
    const { error: erroUpdate } = await supabase
      .from("comanda_itens")
      .update({
        comissao_pago_em: agoraISO,
        comissao_valor_pago: Math.round(snap.valor * 100) / 100,
        comissao_despesa_id: despesa.id,
      })
      .eq("id", snap.id)
      .is("comissao_pago_em", null); // proteção mínima contra corrida

    if (erroUpdate) {
      // Se algum falhar, tenta desfazer a despesa pra não deixar valor inconsistente.
      await supabase.from("despesas").delete().eq("id", despesa.id);
      return {
        ok: false,
        erro: "Falha ao marcar itens como pagos — a despesa foi desfeita, tente de novo.",
      };
    }
  }

  revalidatePath("/comissoes");
  revalidatePath(`/comissoes/${profissionalId}`);
  revalidatePath("/despesas");
  revalidatePath("/financeiro");
  revalidatePath("/caixa");

  return { ok: true, total: totalArredondado, despesaId: despesa.id, itens: pendentes.length };
}

