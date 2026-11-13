import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { AgendamentoForm } from "@/components/AgendamentoForm";
import type { Profile, ProfissionalHorario, Servico } from "@/lib/types";

export default async function NovoAgendamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: dataInicial } = await searchParams;

  const supabase = await createClient();
  const [profile, { data: profissionais }, { data: servicos }, { data: horarios }] =
    await Promise.all([
      getCurrentProfile(),
      supabase.from("profiles").select("*").order("nome") as unknown as Promise<{
        data: Profile[] | null;
      }>,
      supabase
        .from("servicos")
        .select("*")
        .eq("ativo", true)
        .order("ordem") as unknown as Promise<{ data: Servico[] | null }>,
      supabase.from("profissional_horarios").select("*") as unknown as Promise<{
        data: ProfissionalHorario[] | null;
      }>,
    ]);

  if (!profile) redirect("/login");

  // Mesma regra da comanda: com especialidade cadastrada, só mostra os serviços dela.
  const servicosDisponiveis =
    profile.especialidades.length > 0
      ? (servicos ?? []).filter((s) => profile.especialidades.includes(s.nome))
      : servicos ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <h1 className="text-xl font-semibold tracking-tight">Novo agendamento</h1>
        <div className="mt-6">
          <AgendamentoForm
            profile={profile}
            profissionais={profissionais ?? []}
            servicos={servicosDisponiveis}
            horarios={horarios ?? []}
            dataInicial={dataInicial}
          />
        </div>
      </main>
    </div>
  );
}
