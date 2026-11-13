import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { AgendamentoAcoes } from "@/components/AgendamentoAcoes";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/agendamento-status";
import { podeVerAgendaGeral } from "@/lib/permissoes";
import type { AgendamentoComRelacoes, Profile } from "@/lib/types";

export default async function AgendamentosListaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; profissional?: string }>;
}) {
  const { data: filtroData, profissional: filtroProfissional } = await searchParams;

  const supabase = await createClient();

  let query = supabase
    .from("agendamentos")
    .select("*, profissional:profissional_id(id, nome), servico:servico_id(id, nome)")
    .order("data", { ascending: true })
    .order("hora_inicio", { ascending: true });

  if (filtroData) query = query.eq("data", filtroData);
  if (filtroProfissional) query = query.eq("profissional_id", filtroProfissional);

  const [profile, { data: agendamentos }, { data: profissionais }] = await Promise.all([
    getCurrentProfile(),
    query as unknown as Promise<{ data: AgendamentoComRelacoes[] | null }>,
    supabase.from("profiles").select("*").order("nome") as unknown as Promise<{
      data: Profile[] | null;
    }>,
  ]);

  if (!profile) redirect("/login");
  if (!podeVerAgendaGeral(profile)) redirect("/agendamentos/minha");

  const listaProfissionais = profissionais ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/agendamentos" className="text-sm text-muted hover:text-accent-2">
              ← Calendário
            </Link>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Lista de agendamentos</h1>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                name="data"
                defaultValue={filtroData ?? ""}
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2 sm:flex-none"
              />
              <select
                name="profissional"
                defaultValue={filtroProfissional ?? ""}
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2 sm:flex-none"
              >
                <option value="">Todos os profissionais</option>
                {listaProfissionais.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {!p.ativo ? " (inativo)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
              >
                Filtrar
              </button>
              {(filtroData || filtroProfissional) && (
                <Link
                  href="/agendamentos/lista"
                  className="shrink-0 text-sm text-muted transition-colors hover:text-accent-2"
                >
                  Limpar
                </Link>
              )}
            </form>
            <Link
              href="/agendamentos/nova"
              className="brand-gradient glow-accent rounded-lg px-4 py-2 text-center text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              + Novo agendamento
            </Link>
          </div>
        </div>

        {/* Mobile: cards */}
        <div className="mt-6 space-y-2 sm:hidden">
          {agendamentos?.map((ag) => (
            <div key={ag.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">{ag.cliente_nome}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[ag.status]}`}
                >
                  {STATUS_LABEL[ag.status]}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted">
                {new Date(ag.data + "T00:00:00").toLocaleDateString("pt-BR")}
                {" · "}
                {ag.hora_inicio.slice(0, 5)}–{ag.hora_fim.slice(0, 5)}
                {" · "}
                {ag.profissional?.nome ?? "—"}
              </div>
              {ag.servico && <div className="text-sm text-muted">{ag.servico.nome}</div>}
              <div className="mt-2">
                <AgendamentoAcoes
                  agendamentoId={ag.id}
                  status={ag.status}
                  profissionalAtualId={ag.profissional_id}
                  profissionais={listaProfissionais}
                />
              </div>
            </div>
          ))}
          {agendamentos?.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhum agendamento encontrado.
            </div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Hora</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Serviço</th>
                  <th className="px-4 py-2 font-medium">Profissional</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agendamentos?.map((ag) => (
                  <tr key={ag.id} className="transition-colors hover:bg-card-hover">
                    <td className="px-4 py-2">
                      {new Date(ag.data + "T00:00:00").toLocaleDateString("pt-BR")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {ag.hora_inicio.slice(0, 5)}–{ag.hora_fim.slice(0, 5)}
                    </td>
                    <td className="px-4 py-2">{ag.cliente_nome}</td>
                    <td className="px-4 py-2 text-muted">{ag.servico?.nome ?? "—"}</td>
                    <td className="px-4 py-2 text-muted">{ag.profissional?.nome ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[ag.status]}`}
                      >
                        {STATUS_LABEL[ag.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <AgendamentoAcoes
                        agendamentoId={ag.id}
                        status={ag.status}
                        profissionalAtualId={ag.profissional_id}
                        profissionais={listaProfissionais}
                      />
                    </td>
                  </tr>
                ))}
                {agendamentos?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted">
                      Nenhum agendamento encontrado.
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
