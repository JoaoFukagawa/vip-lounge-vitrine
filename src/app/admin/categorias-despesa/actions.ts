"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/current-profile";
import { podeGerenciarFinanceiro } from "@/lib/permissoes";

type FormState = string | null;

export async function criarCategoria(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) {
    return "Apenas administradores podem gerenciar categorias.";
  }

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!grupoId) return "Escolha um grupo.";
  if (!nome) return "Informe o nome da categoria.";

  const supabase = await createClient();
  const { data: ultima } = await supabase
    .from("despesa_categorias")
    .select("ordem")
    .eq("grupo_id", grupoId)
    .order("ordem", { ascending: false })
    .limit(1)
    .single();

  const { error } = await supabase.from("despesa_categorias").insert({
    grupo_id: grupoId,
    nome,
    ordem: (ultima?.ordem ?? 0) + 10,
  });

  if (error) {
    return error.message.includes("duplicate")
      ? "Já existe uma categoria com esse nome nesse grupo."
      : "Não foi possível criar a categoria.";
  }

  revalidatePath("/admin/categorias-despesa");
  revalidatePath("/despesas");
  return null;
}

export async function renomearCategoria(id: string, nome: string) {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) return;

  const supabase = await createClient();
  await supabase.from("despesa_categorias").update({ nome: nome.trim() }).eq("id", id);

  revalidatePath("/admin/categorias-despesa");
  revalidatePath("/despesas");
}

export async function alternarCategoriaAtiva(id: string, ativa: boolean) {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) return;

  const supabase = await createClient();
  await supabase.from("despesa_categorias").update({ ativa }).eq("id", id);

  revalidatePath("/admin/categorias-despesa");
  revalidatePath("/despesas");
}

export async function excluirCategoria(id: string): Promise<{ ok: boolean; erro?: string }> {
  const requester = await getCurrentProfile();
  if (!requester || !podeGerenciarFinanceiro(requester)) {
    return { ok: false, erro: "Sem permissão." };
  }

  const supabase = await createClient();

  // Categoria protegida (usada pela aplicação, ex: "Comissões pagas") não pode
  // ser excluída — só desativada.
  const { data: cat } = await supabase
    .from("despesa_categorias")
    .select("sistema_chave")
    .eq("id", id)
    .single();
  if (cat?.sistema_chave) {
    return {
      ok: false,
      erro: "Essa categoria é usada pelo sistema; desative em vez de excluir.",
    };
  }

  // Já tem despesa lançada? Bloqueia pra não perder o histórico.
  const { count } = await supabase
    .from("despesas")
    .select("id", { head: true, count: "exact" })
    .eq("categoria_id", id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: "Existem despesas lançadas nessa categoria; desative em vez de excluir.",
    };
  }

  const { error } = await supabase.from("despesa_categorias").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir." };

  revalidatePath("/admin/categorias-despesa");
  revalidatePath("/despesas");
  return { ok: true };
}
