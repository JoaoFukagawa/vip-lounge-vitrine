import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaixaSessao } from "./types";

// As travas do caixa (triggers/funções) levantam mensagens prontas pra quem usa
// o sistema (código P0001). Qualquer outro erro vira a mensagem genérica.
export function mensagemErro(
  error: { code?: string; message?: string } | null | undefined,
  generica: string
) {
  if (error?.code === "P0001" && error.message) return error.message;
  return generica;
}

export async function buscarCaixaAberto(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("caixa_sessoes")
    .select("*")
    .eq("status", "aberto")
    .maybeSingle();
  return (data as CaixaSessao | null) ?? null;
}

export function parseValor(bruto: FormDataEntryValue | string | null | undefined) {
  const texto = String(bruto ?? "").trim();
  if (!texto) return null;
  // Aceita "1.234,56", "1234,56" e "1234.56".
  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;
  const v = parseFloat(normalizado);
  return isNaN(v) ? null : v;
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
