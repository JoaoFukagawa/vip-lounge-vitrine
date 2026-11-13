"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/current-profile";
import type { TipoCartao } from "@/lib/types";

export async function atualizarTaxaCartao(_prevState: string | null, formData: FormData) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") {
    return "Apenas administradores podem editar as taxas.";
  }

  const debito = parseFloat(String(formData.get("debito") ?? "").replace(",", "."));
  const credito = parseFloat(String(formData.get("credito") ?? "").replace(",", "."));

  if (isNaN(debito) || debito < 0 || debito > 100) {
    return "Taxa de débito inválida (use um número de 0 a 100).";
  }
  if (isNaN(credito) || credito < 0 || credito > 100) {
    return "Taxa de crédito inválida (use um número de 0 a 100).";
  }

  const supabase = await createClient();
  const linhas: { tipo: TipoCartao; taxa_percentual: number }[] = [
    { tipo: "debito", taxa_percentual: debito },
    { tipo: "credito", taxa_percentual: credito },
  ];

  const { error } = await supabase.from("taxas_cartao").upsert(linhas, { onConflict: "tipo" });
  if (error) return "Não foi possível salvar as taxas.";

  revalidatePath("/admin/taxas");
  revalidatePath("/comissoes");
  revalidatePath("/financeiro");
  return null;
}
