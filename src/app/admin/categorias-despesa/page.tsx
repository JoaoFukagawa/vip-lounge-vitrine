import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { AdminSubNav } from "@/components/AdminSubNav";
import { podeGerenciarFinanceiro } from "@/lib/permissoes";
import { NovaCategoriaForm } from "./NovaCategoriaForm";
import { CategoriaRow } from "./CategoriaRow";
import type { DespesaCategoria, DespesaGrupo } from "@/lib/types";

export default async function CategoriasDespesaPage() {
  const supabase = await createClient();
  const [profile, { data: grupos }, { data: categorias }] = await Promise.all([
    getCurrentProfile(),
    supabase.from("despesa_grupos").select("*").order("ordem") as unknown as Promise<{
      data: DespesaGrupo[] | null;
    }>,
    supabase
      .from("despesa_categorias")
      .select("*")
      .order("ordem") as unknown as Promise<{ data: DespesaCategoria[] | null }>,
  ]);

  if (!profile) redirect("/login");
  if (!podeGerenciarFinanceiro(profile)) redirect("/");

  const gruposOrdenados = grupos ?? [];
  const catsPorGrupo = new Map<string, DespesaCategoria[]>();
  for (const c of categorias ?? []) {
    const arr = catsPorGrupo.get(c.grupo_id) ?? [];
    arr.push(c);
    catsPorGrupo.set(c.grupo_id, arr);
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <AdminSubNav ativo="/admin/categorias-despesa" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          Categorias de despesa
        </h1>
        <p className="mt-1 text-sm text-muted">
          Categorias inativas somem do formulário de despesa nova mas continuam
          nos relatórios antigos. Categorias marcadas como <em>usada pelo sistema</em>{" "}
          podem ser renomeadas mas não excluídas.
        </p>

        <div className="mt-6">
          <NovaCategoriaForm grupos={gruposOrdenados} />
        </div>

        <div className="mt-6 space-y-6">
          {gruposOrdenados.map((g) => {
            const itens = catsPorGrupo.get(g.id) ?? [];
            return (
              <section key={g.id}>
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                  {g.nome}
                </h2>
                <div className="mt-2 space-y-1.5">
                  {itens.map((c) => (
                    <CategoriaRow key={c.id} categoria={c} />
                  ))}
                  {itens.length === 0 && (
                    <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted">
                      Nenhuma categoria nesse grupo.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
