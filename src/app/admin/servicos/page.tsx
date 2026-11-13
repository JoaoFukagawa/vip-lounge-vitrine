import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { AdminSubNav } from "@/components/AdminSubNav";
import { CreateServicoForm } from "./CreateServicoForm";
import { ServicoRow } from "./ServicoRow";
import { ServicoCard } from "./ServicoCard";
import type { Servico } from "@/lib/types";

export default async function ServicosPage() {
  const supabase = await createClient();
  const [profile, { data: servicos }] = await Promise.all([
    getCurrentProfile(),
    supabase.from("servicos").select("*").order("ordem") as unknown as Promise<{
      data: Servico[] | null;
    }>,
  ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <AdminSubNav ativo="/admin/servicos" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Serviços</h1>
        <p className="mt-1 text-sm text-muted">
          Cadastre os serviços do salão e a comissão de cada um. Serviços inativos
          somem da comanda, mas continuam nos relatórios antigos.
        </p>

        <div className="mt-6">
          <CreateServicoForm />
        </div>

        {/* Mobile: cards */}
        <div className="mt-6 space-y-2 sm:hidden">
          {servicos?.map((s) => (
            <ServicoCard key={s.id} servico={s} />
          ))}
          {servicos?.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhum serviço cadastrado.
            </div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Serviço</th>
                  <th className="px-4 py-2 font-medium">Comissão</th>
                  <th className="px-4 py-2 font-medium">Ativo</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {servicos?.map((s) => (
                  <ServicoRow key={s.id} servico={s} />
                ))}
                {servicos?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted">
                      Nenhum serviço cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
