"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/current-profile";

export async function createServico(_prevState: string | null, formData: FormData) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") {
    return "Apenas administradores podem cadastrar serviços.";
  }

  const nome = String(formData.get("nome") ?? "").trim();
  const comissao = parseFloat(String(formData.get("comissao") ?? "").replace(",", "."));

  if (!nome) return "Informe o nome do serviço.";
  if (isNaN(comissao) || comissao < 0 || comissao > 100) {
    return "Comissão inválida (use um número de 0 a 100).";
  }

  const supabase = await createClient();
  const { data: ultimo } = await supabase
    .from("servicos")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .single();

  const { error } = await supabase.from("servicos").insert({
    nome,
    comissao_percentual: comissao,
    ordem: (ultimo?.ordem ?? -1) + 1,
  });

  if (error) {
    return error.message.includes("duplicate")
      ? "Já existe um serviço com esse nome."
      : "Não foi possível criar o serviço.";
  }

  revalidatePath("/admin/servicos");
  return null;
}

export async function atualizarServico(
  id: string,
  dados: { comissaoPercentual?: number; ativo?: boolean }
) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") return;

  const supabase = await createClient();
  await supabase
    .from("servicos")
    .update({
      ...(dados.comissaoPercentual !== undefined && {
        comissao_percentual: dados.comissaoPercentual,
      }),
      ...(dados.ativo !== undefined && { ativo: dados.ativo }),
    })
    .eq("id", id);

  revalidatePath("/admin/servicos");
  revalidatePath("/comandas/nova");
  revalidatePath("/comissoes");
}

export async function excluirServico(id: string) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") return;

  const supabase = await createClient();
  await supabase.from("servicos").delete().eq("id", id);
  revalidatePath("/admin/servicos");
  revalidatePath("/comandas/nova");
}
