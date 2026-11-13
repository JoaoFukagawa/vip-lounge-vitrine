import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { AgendamentoAcoes } from "@/components/AgendamentoAcoes";
import { EditProfileForm } from "./EditProfileForm";
import { StatusUsuarioCard } from "./StatusUsuarioCard";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { hojeSP } from "@/lib/data";
import type { AgendamentoComRelacoes, Profile, ProfissionalHorario, Servico } from "@/lib/types";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    profile,
    { data: usuario },
    { data: servicos },
    { data: profissionais },
    { data: agendamentosFuturos },
    { data: horarios },
  ] = await Promise.all([
    getCurrentProfile(),
    supabase.from("profiles").select("*").eq("id", id).single() as unknown as Promise<{
      data: Profile | null;
    }>,
    supabase.from("servicos").select("*").order("ordem") as unknown as Promise<{
      data: Servico[] | null;
    }>,
    supabase.from("profiles").select("*").order("nome") as unknown as Promise<{
      data: Profile[] | null;
    }>,
    supabase
      .from("agendamentos")
      .select("*, profissional:profissional_id(id, nome), servico:servico_id(id, nome)")
      .eq("profissional_id", id)
      .eq("status", "agendado")
      .gte("data", hojeSP())
      .order("data", { ascending: true })
      .order("hora_inicio", { ascending: true }) as unknown as Promise<{
      data: AgendamentoComRelacoes[] | null;
    }>,
    supabase
      .from("profissional_horarios")
      .select("*")
      .eq("profissional_id", id) as unknown as Promise<{ data: ProfissionalHorario[] | null }>,
  ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");
  if (!usuario) notFound();

  const listaAgendamentos = agendamentosFuturos ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex items-center gap-3">
          <Link href="/admin/usuarios" className="text-sm text-muted hover:text-accent-2">
            ← Usuários
          </Link>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{usuario.nome}</h1>

        <div className="mt-6 space-y-6">
          <StatusUsuarioCard
            userId={usuario.id}
            ativo={usuario.ativo}
            agendamentosFuturos={listaAgendamentos.length}
          />

          <EditProfileForm profile={usuario} servicos={servicos ?? []} horarios={horarios ?? []} />

          <ResetPasswordForm userId={usuario.id} />

          <div>
            <h2 className="text-sm font-medium text-foreground">
              Agendamentos futuros ({listaAgendamentos.length})
            </h2>
            <div className="mt-3 space-y-2">
              {listaAgendamentos.map((ag) => (
                <div
                  key={ag.id}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium text-foreground">{ag.cliente_nome}</div>
                    <div className="text-sm text-muted">
                      {new Date(ag.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      {" · "}
                      {ag.hora_inicio.slice(0, 5)}
                      {ag.servico && ` · ${ag.servico.nome}`}
                    </div>
                  </div>
                  <AgendamentoAcoes
                    agendamentoId={ag.id}
                    status={ag.status}
                    profissionalAtualId={ag.profissional_id}
                    profissionais={profissionais ?? []}
                  />
                </div>
              ))}
              {listaAgendamentos.length === 0 && (
                <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted">
                  Nenhum agendamento futuro para este profissional.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
