"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/current-profile";
import { podeGerenciarFinanceiro } from "@/lib/permissoes";
import { buscarCaixaAberto, mensagemErro } from "@/lib/caixa";
import type { DespesaStatus, FormaPagamentoDespesa } from "@/lib/types";

type FormState = string | null;

const FORMAS: FormaPagamentoDespesa[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "boleto",
  "transferencia",
  "outro",
];

function parseValor(bruto: string): number | null {
  const limpo = bruto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(limpo);
  if (isNaN(v) || v < 0) return null;
  return v;
}

function extrairFormaPagamento(bruto: string): FormaPagamentoDespesa | null {
  if (!bruto) return null;
  return (FORMAS as string[]).includes(bruto) ? (bruto as FormaPagamentoDespesa) : null;
}

function extrairStatus(bruto: string): DespesaStatus {
  return bruto === "a_pagar" ? "a_pagar" : "pago";
}

export async function criarDespesa(_prev: FormState, formData: FormData): Promise<FormState> {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) {
    return "Apenas administradores podem lançar despesas.";
  }

  const categoriaId = String(formData.get("categoria_id") ?? "").trim();
  const data = String(formData.get("data") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const fornecedor = String(formData.get("fornecedor") ?? "").trim();
  const valor = parseValor(String(formData.get("valor") ?? ""));
  const forma = extrairFormaPagamento(String(formData.get("forma_pagamento") ?? ""));
  const status = extrairStatus(String(formData.get("status") ?? "pago"));
  const dataVencimento = String(formData.get("data_vencimento") ?? "").trim();
  const observacoes = String(formData.get("observacoes") ?? "").trim();

  if (!categoriaId) return "Escolha uma categoria.";
  if (!data) return "Informe a data.";
  if (!descricao) return "Informe a descrição.";
  if (valor === null) return "Valor inválido.";
  if (status === "a_pagar" && !dataVencimento) {
    return "Despesa a pagar precisa de data de vencimento.";
  }

  const doCaixa = formData.get("do_caixa") === "on";
  if (doCaixa && (forma !== "dinheiro" || status !== "pago")) {
    return "Só despesa já paga em dinheiro pode sair do caixa.";
  }

  const supabase = await createClient();
  const caixa = doCaixa ? await buscarCaixaAberto(supabase) : null;
  if (doCaixa && !caixa) return "Nenhum caixa aberto para tirar esse dinheiro.";

  const { error } = await supabase.from("despesas").insert({
    data,
    categoria_id: categoriaId,
    descricao,
    fornecedor: fornecedor || null,
    valor,
    forma_pagamento: forma,
    status,
    data_vencimento: status === "a_pagar" ? dataVencimento : null,
    data_pagamento: status === "pago" ? data : null,
    observacoes: observacoes || null,
    criado_por: requester.id,
    caixa_sessao_id: caixa?.id ?? null,
  });

  if (error) return mensagemErro(error, "Não foi possível cadastrar a despesa.");
  revalidatePath("/caixa");

  revalidatePath("/despesas");
  revalidatePath("/financeiro");
  redirect("/despesas");
}

export async function atualizarDespesa(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) {
    return "Apenas administradores podem editar despesas.";
  }

  const categoriaId = String(formData.get("categoria_id") ?? "").trim();
  const data = String(formData.get("data") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const fornecedor = String(formData.get("fornecedor") ?? "").trim();
  const valor = parseValor(String(formData.get("valor") ?? ""));
  const forma = extrairFormaPagamento(String(formData.get("forma_pagamento") ?? ""));
  const status = extrairStatus(String(formData.get("status") ?? "pago"));
  const dataVencimento = String(formData.get("data_vencimento") ?? "").trim();
  const observacoes = String(formData.get("observacoes") ?? "").trim();

  if (!categoriaId) return "Escolha uma categoria.";
  if (!data) return "Informe a data.";
  if (!descricao) return "Informe a descrição.";
  if (valor === null) return "Valor inválido.";
  if (status === "a_pagar" && !dataVencimento) {
    return "Despesa a pagar precisa de data de vencimento.";
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("despesas")
    .update({
      data,
      categoria_id: categoriaId,
      descricao,
      fornecedor: fornecedor || null,
      valor,
      forma_pagamento: forma,
      status,
      data_vencimento: status === "a_pagar" ? dataVencimento : null,
      data_pagamento: status === "pago" ? data : null,
      observacoes: observacoes || null,
    })
    .eq("id", id);

  if (error) return mensagemErro(error, "Não foi possível atualizar a despesa.");
  revalidatePath("/caixa");

  revalidatePath("/despesas");
  revalidatePath(`/despesas/${id}`);
  revalidatePath("/financeiro");
  redirect("/despesas");
}

export async function marcarDespesaPaga(id: string, dataPagamento: string) {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) return;

  const supabase = await createClient();
  await supabase
    .from("despesas")
    .update({ status: "pago", data_pagamento: dataPagamento })
    .eq("id", id);

  revalidatePath("/despesas");
  revalidatePath(`/despesas/${id}`);
  revalidatePath("/financeiro");
}

export async function excluirDespesa(id: string): Promise<{ error?: string }> {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) {
    return { error: "Apenas administradores podem excluir despesas." };
  }

  const supabase = await createClient();
  // Se essa despesa era pagamento de comissão, os itens vinculados voltam pra
  // pendência. Guarda quais são antes (o vínculo vira nulo ao apagar) e só mexe
  // neles se a exclusão passar — despesa de caixa fechado não pode ser excluída.
  const { data: vinculados } = await supabase
    .from("comanda_itens")
    .select("id")
    .eq("comissao_despesa_id", id);

  const { error } = await supabase.from("despesas").delete().eq("id", id);
  if (error) return { error: mensagemErro(error, "Não foi possível excluir a despesa.") };

  const ids = (vinculados ?? []).map((i) => i.id);
  if (ids.length > 0) {
    await supabase
      .from("comanda_itens")
      .update({ comissao_despesa_id: null, comissao_pago_em: null, comissao_valor_pago: null })
      .in("id", ids);
  }

  revalidatePath("/despesas");
  revalidatePath("/comissoes");
  revalidatePath("/financeiro");
  revalidatePath("/caixa");
  redirect("/despesas");
}
