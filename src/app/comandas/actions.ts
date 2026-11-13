"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/caixa";
import { getCurrentProfile } from "@/lib/current-profile";
import type { Pagamento } from "@/lib/types";

export type ItemInput = {
  servico: string;
  profissionalId: string | null;
  valor: number;
};

export type ComandaInput = {
  data: string;
  clienteNome: string;
  clienteContato: string;
  clienteId?: string | null;
  pagamentos: Pagamento[];
  itens: ItemInput[];
  agendamentoId?: string | null;
};

type ItemExistente = {
  id: string;
  servico: string;
  profissional_id: string | null;
  valor: number;
  ordem: number;
  comissao_pago_em: string | null;
  comissao_valor_pago: number | null;
  comissao_despesa_id: string | null;
};

const mesmoItem = (a: ItemExistente, b: ItemInput) =>
  a.servico === b.servico &&
  (a.profissional_id ?? null) === (b.profissionalId ?? null) &&
  Math.abs(Number(a.valor) - b.valor) < 0.005;

function limparPagamentos(pagamentos: Pagamento[]): Pagamento[] {
  return pagamentos
    .filter((p) => p.valor > 0)
    .map((p) => ({
      forma: p.forma,
      valor: p.valor,
      parcelas: p.parcelas ?? null,
      tipo_cartao: p.tipo_cartao ?? null,
      ...(p.forma === "dinheiro" && p.valor_recebido ? { valor_recebido: p.valor_recebido } : {}),
    }));
}

export async function salvarComanda(input: ComandaInput, comandaId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  const itensValidos = input.itens.filter((item) => item.valor > 0);
  const total = itensValidos.reduce((soma, item) => soma + item.valor, 0);
  const pagamentosValidos = limparPagamentos(input.pagamentos);
  const dadosCliente = {
    cliente_nome: input.clienteNome || null,
    cliente_contato: input.clienteContato || null,
    cliente_id: input.clienteId ?? null,
  };

  if (comandaId) {
    const { data: atual } = (await supabase
      .from("comandas")
      .select(
        "caixa_sessao_id, caixa:caixa_sessao_id(status), comanda_itens(id, servico, profissional_id, valor, ordem, comissao_pago_em, comissao_valor_pago, comissao_despesa_id)"
      )
      .eq("id", comandaId)
      .single()) as unknown as {
      data: {
        caixa_sessao_id: string | null;
        caixa: { status: string } | null;
        comanda_itens: ItemExistente[];
      } | null;
    };
    if (!atual) return { error: "Comanda não encontrada." };

    // Valores só mudam enquanto a comanda pertence ao caixa aberto. Comanda de
    // caixa fechado (ou de antes do caixa) só troca os dados da cliente; o
    // restante é recebido pela tela de Duplicatas.
    const financeiroLiberado = atual.caixa?.status === "aberto";

    if (!financeiroLiberado) {
      const { error } = await supabase.from("comandas").update(dadosCliente).eq("id", comandaId);
      if (error) return { error: mensagemErro(error, "Não foi possível salvar a comanda.") };
      revalidatePath("/");
      redirect("/");
    }

    const { error: updateError } = await supabase
      .from("comandas")
      .update({
        ...dadosCliente,
        data: input.data,
        pagamentos: pagamentosValidos,
        total,
        updated_at: new Date().toISOString(),
      })
      .eq("id", comandaId);

    if (updateError) {
      return { error: mensagemErro(updateError, "Não foi possível salvar a comanda.") };
    }

    const existentes = [...atual.comanda_itens].sort((a, b) => a.ordem - b.ordem);
    const itensIguais =
      existentes.length === itensValidos.length &&
      existentes.every((item, i) => mesmoItem(item, itensValidos[i]));

    if (!itensIguais) {
      // Reaproveita o status de comissão paga dos serviços que continuam iguais.
      const sobra = [...existentes];
      const novos = itensValidos.map((item, ordem) => {
        const idx = sobra.findIndex((e) => mesmoItem(e, item));
        const anterior = idx >= 0 ? sobra.splice(idx, 1)[0] : null;
        return {
          comanda_id: comandaId,
          servico: item.servico,
          profissional_id: item.profissionalId,
          valor: item.valor,
          ordem,
          comissao_pago_em: anterior?.comissao_pago_em ?? null,
          comissao_valor_pago: anterior?.comissao_valor_pago ?? null,
          comissao_despesa_id: anterior?.comissao_despesa_id ?? null,
        };
      });

      // Grava os novos antes de apagar os antigos: se algo falhar no meio, nada se perde.
      if (novos.length > 0) {
        const { error: itensError } = await supabase.from("comanda_itens").insert(novos);
        if (itensError) {
          return { error: mensagemErro(itensError, "Não foi possível salvar os serviços.") };
        }
      }
      if (existentes.length > 0) {
        const { error: deleteError } = await supabase
          .from("comanda_itens")
          .delete()
          .in(
            "id",
            existentes.map((e) => e.id)
          );
        if (deleteError) {
          return { error: mensagemErro(deleteError, "Não foi possível salvar os serviços.") };
        }
      }
    }

    revalidatePath("/");
    revalidatePath("/caixa");
    redirect("/");
  }

  const { data: comanda, error: insertError } = await supabase
    .from("comandas")
    .insert({
      ...dadosCliente,
      data: input.data,
      pagamentos: pagamentosValidos,
      total,
      criado_por: user.id,
    })
    .select("id")
    .single();

  if (insertError || !comanda) {
    return { error: mensagemErro(insertError, "Não foi possível criar a comanda.") };
  }

  if (itensValidos.length > 0) {
    const { error: itensError } = await supabase.from("comanda_itens").insert(
      itensValidos.map((item, ordem) => ({
        comanda_id: comanda.id,
        servico: item.servico,
        profissional_id: item.profissionalId,
        valor: item.valor,
        ordem,
      }))
    );
    if (itensError) {
      return { error: mensagemErro(itensError, "Não foi possível salvar os serviços.") };
    }
  }

  if (input.agendamentoId) {
    await supabase
      .from("agendamentos")
      .update({ comanda_id: comanda.id, status: "concluido" })
      .eq("id", input.agendamentoId);
    revalidatePath("/agendamentos");
    revalidatePath("/agendamentos/lista");
    revalidatePath("/agendamentos/minha");
  }

  revalidatePath("/");
  revalidatePath("/caixa");
  redirect("/");
}

export async function excluirComanda(comandaId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("comandas").delete().eq("id", comandaId);
  if (error) return { error: mensagemErro(error, "Não foi possível excluir a comanda.") };
  revalidatePath("/");
  revalidatePath("/caixa");
  return {};
}

// Corrige a profissional de um serviço — inclusive em comanda de caixa já
// fechado (não mexe em nenhum valor do caixa). Só admin. Se a comissão desse
// serviço já tinha sido paga, ela volta a ficar pendente para a nova
// profissional; o pagamento feito à anterior continua registrado em Despesas.
export async function corrigirProfissional(
  itemId: string,
  profissionalId: string
): Promise<{ error?: string }> {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") {
    return { error: "Só a administração pode corrigir a profissional." };
  }

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("comanda_itens")
    .select("comanda_id, profissional_id, comissao_pago_em")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { error: "Serviço não encontrado." };
  if (item.profissional_id === profissionalId) return {};

  const { error } = await supabase
    .from("comanda_itens")
    .update({
      profissional_id: profissionalId,
      ...(item.comissao_pago_em
        ? { comissao_pago_em: null, comissao_valor_pago: null, comissao_despesa_id: null }
        : {}),
    })
    .eq("id", itemId);
  if (error) return { error: mensagemErro(error, "Não foi possível trocar a profissional.") };

  revalidatePath(`/comandas/${item.comanda_id}`);
  revalidatePath("/comissoes");
  revalidatePath("/financeiro");
  return {};
}
