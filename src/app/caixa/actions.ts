"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/current-profile";
import { buscarCaixaAberto, mensagemErro, parseValor } from "@/lib/caixa";
import { podeGerenciarCaixa } from "@/lib/permissoes";

type Estado = string | null;

function revalidarCaixa() {
  revalidatePath("/caixa");
  revalidatePath("/caixa/historico");
  revalidatePath("/");
  revalidatePath("/despesas");
  revalidatePath("/financeiro");
  revalidatePath("/duplicatas");
}

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();

const SO_ADMIN = "Apenas administradores podem mexer no caixa.";

async function ehAdmin() {
  const p = await getCurrentProfile();
  return !!p && podeGerenciarCaixa(p);
}

export async function abrirCaixa(_prev: Estado, formData: FormData): Promise<Estado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const fundo = parseValor(formData.get("fundo"));
  if (fundo === null || fundo < 0) return "Informe quanto dinheiro tem na gaveta agora.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("abrir_caixa", {
    p_fundo_contado: fundo,
    p_cedulas: null,
    p_justificativa: texto(formData.get("justificativa")) || null,
  });
  if (error) return mensagemErro(error, "Não foi possível abrir o caixa.");

  revalidarCaixa();
  return null;
}

export async function lancarMovimento(_prev: Estado, formData: FormData): Promise<Estado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const tipo = texto(formData.get("tipo"));
  const valor = parseValor(formData.get("valor"));
  if (valor === null || valor <= 0) return "Informe um valor maior que zero.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("lancar_movimento", {
    p_tipo: tipo,
    p_valor: valor,
    p_descricao: texto(formData.get("descricao")),
    p_sentido: texto(formData.get("sentido")) || null,
  });
  if (error) return mensagemErro(error, "Não foi possível lançar.");

  revalidarCaixa();
  return null;
}

export async function estornarMovimento(movimentoId: string, motivo: string) {
  if (!(await ehAdmin())) return { error: SO_ADMIN };
  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_movimento", {
    p_movimento_id: movimentoId,
    p_motivo: motivo,
  });
  if (error) return { error: mensagemErro(error, "Não foi possível estornar.") };
  revalidarCaixa();
  return {};
}

// Saída da gaveta pra pagar alguma coisa (refrigerante, material...). Vira uma
// despesa normal, paga em dinheiro, ligada ao caixa aberto — aparece também em
// Despesas e no Financeiro.
export async function lancarSaida(_prev: Estado, formData: FormData): Promise<Estado> {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarCaixa(requester)) return SO_ADMIN;

  const valor = parseValor(formData.get("valor"));
  const descricao = texto(formData.get("descricao"));
  const categoriaId = texto(formData.get("categoria_id"));
  if (valor === null || valor <= 0) return "Informe um valor maior que zero.";
  if (!descricao) return "Informe o que foi pago.";
  if (!categoriaId) return "Escolha uma categoria.";

  const supabase = await createClient();
  const caixa = await buscarCaixaAberto(supabase);
  if (!caixa) return "Nenhum caixa aberto.";

  const { error } = await supabase.from("despesas").insert({
    data: caixa.data_operacional,
    categoria_id: categoriaId,
    descricao,
    valor,
    forma_pagamento: "dinheiro",
    status: "pago",
    data_pagamento: caixa.data_operacional,
    caixa_sessao_id: caixa.id,
    criado_por: requester.id,
  });
  if (error) return mensagemErro(error, "Não foi possível lançar a saída.");

  revalidarCaixa();
  return null;
}

export async function fecharCaixa(_prev: Estado, formData: FormData): Promise<Estado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const contado = parseValor(formData.get("contado_dinheiro"));
  const cartao = parseValor(formData.get("informado_cartao")) ?? 0;
  const pix = parseValor(formData.get("informado_pix")) ?? 0;
  const fundo = parseValor(formData.get("fundo_deixado")) ?? 0;
  if (contado === null) return "Conte o dinheiro da gaveta e informe o total.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("fechar_caixa", {
    p_contado_dinheiro: contado,
    p_cedulas: null,
    p_informado_cartao: cartao,
    p_informado_pix: pix,
    p_fundo_deixado: fundo,
    p_observacao: texto(formData.get("observacao")) || null,
  });
  if (error) return mensagemErro(error, "Não foi possível fechar o caixa.");

  revalidarCaixa();
  return null;
}

export async function conferirCaixa(sessaoId: string, observacao: string) {
  if (!(await ehAdmin())) return { error: SO_ADMIN };
  const supabase = await createClient();
  const { error } = await supabase.rpc("conferir_caixa", {
    p_sessao_id: sessaoId,
    p_observacao: observacao || null,
  });
  if (error) return { error: mensagemErro(error, "Não foi possível conferir.") };
  revalidarCaixa();
  revalidatePath(`/caixa/${sessaoId}`);
  return {};
}

export async function reabrirCaixa(sessaoId: string, motivo: string) {
  if (!(await ehAdmin())) return { error: SO_ADMIN };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reabrir_caixa", {
    p_sessao_id: sessaoId,
    p_motivo: motivo,
  });
  if (error) return { error: mensagemErro(error, "Não foi possível reabrir.") };
  revalidarCaixa();
  revalidatePath(`/caixa/${sessaoId}`);
  return {};
}

// Baixa de duplicata: acrescenta o pagamento no caixa aberto de hoje.
export async function receberPagamento(
  comandaId: string,
  _prev: Estado,
  formData: FormData
): Promise<Estado> {
  const forma = texto(formData.get("forma"));
  const valor = parseValor(formData.get("valor"));
  const recebido = parseValor(formData.get("valor_recebido"));
  const tipoCartao = texto(formData.get("tipo_cartao")) || null;
  const parcelas = parseInt(texto(formData.get("parcelas")), 10);
  if (valor === null || valor <= 0) return "Informe um valor maior que zero.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("receber_pagamento", {
    p_comanda_id: comandaId,
    p_forma: forma,
    p_valor: valor,
    p_tipo_cartao: forma === "cartao" ? tipoCartao : null,
    p_parcelas: forma === "cartao" && tipoCartao === "credito" && !isNaN(parcelas) ? parcelas : null,
    p_valor_recebido: forma === "dinheiro" ? recebido : null,
  });
  if (error) return mensagemErro(error, "Não foi possível registrar o recebimento.");

  revalidarCaixa();
  revalidatePath(`/comandas/${comandaId}`);
  redirect("/duplicatas");
}
