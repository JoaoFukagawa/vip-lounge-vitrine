import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { podeGerenciarFinanceiro } from "@/lib/permissoes";
import { hojeSP } from "@/lib/data";
import { buscarCaixaAberto } from "@/lib/caixa";
import { DespesaForm } from "../DespesaForm";
import { criarDespesa } from "../actions";
import type { DespesaCategoriaComGrupo } from "@/lib/types";

export default async function NovaDespesaPage() {
  const supabase = await createClient();
  const [profile, { data: categorias }, caixa] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("despesa_categorias")
      .select("*, grupo:grupo_id(id, nome, ordem)")
      .order("ordem") as unknown as Promise<{ data: DespesaCategoriaComGrupo[] | null }>,
    buscarCaixaAberto(supabase),
  ]);

  if (!profile) redirect("/login");
  if (!podeGerenciarFinanceiro(profile)) redirect("/");

  const cats = (categorias ?? []).sort(
    (a, b) => a.grupo.ordem - b.grupo.ordem || a.ordem - b.ordem
  );

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
        <Link href="/despesas" className="text-sm text-muted hover:text-accent-2">
          ← Despesas
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Nova despesa</h1>
        <DespesaForm
          categorias={cats}
          action={criarDespesa}
          submitLabel="Salvar"
          pendingLabel="Salvando..."
          hojeISO={hojeSP()}
          caixaAberto={!!caixa}
        />
      </main>
    </div>
  );
}
