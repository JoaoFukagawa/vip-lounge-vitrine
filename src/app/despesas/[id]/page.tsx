import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { podeGerenciarFinanceiro } from "@/lib/permissoes";
import { hojeSP } from "@/lib/data";
import { DespesaForm } from "../DespesaForm";
import { atualizarDespesa } from "../actions";
import { DespesaAcoes } from "../DespesaAcoes";
import type { Despesa, DespesaCategoriaComGrupo } from "@/lib/types";

export default async function EditarDespesaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [profile, { data: despesa }, { data: categorias }] = await Promise.all([
    getCurrentProfile(),
    supabase.from("despesas").select("*").eq("id", id).single() as unknown as Promise<{
      data: Despesa | null;
    }>,
    supabase
      .from("despesa_categorias")
      .select("*, grupo:grupo_id(id, nome, ordem)")
      .order("ordem") as unknown as Promise<{ data: DespesaCategoriaComGrupo[] | null }>,
  ]);

  if (!profile) redirect("/login");
  if (!podeGerenciarFinanceiro(profile)) redirect("/");
  if (!despesa) notFound();

  const cats = (categorias ?? []).sort(
    (a, b) => a.grupo.ordem - b.grupo.ordem || a.ordem - b.ordem
  );

  const editarAction = atualizarDespesa.bind(null, despesa.id);

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
        <Link href="/despesas" className="text-sm text-muted hover:text-accent-2">
          ← Despesas
        </Link>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Editar despesa</h1>
          <DespesaAcoes despesa={despesa} hojeISO={hojeSP()} />
        </div>
        <DespesaForm
          categorias={cats}
          despesa={despesa}
          action={editarAction}
          submitLabel="Salvar alterações"
          pendingLabel="Salvando..."
          hojeISO={hojeSP()}
        />
      </main>
    </div>
  );
}
