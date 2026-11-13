import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { AgendamentoAcoes } from "@/components/AgendamentoAcoes";
import { addDias, hojeSP } from "@/lib/data";
import { podeVerAgendaGeral } from "@/lib/permissoes";
import type { AgendamentoComRelacoes, Profile } from "@/lib/types";

function formatarCabecalhoData(dataISO: string, hoje: string, amanha: string) {
  const d = new Date(dataISO + "T00:00:00");
  const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  if (dataISO === hoje) return `Hoje · ${label}`;
  if (dataISO === amanha) return `Amanhã · ${label}`;
  return label;
}

export default async function MinhaAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: filtroData } = await searchParams;

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const hoje = hojeSP();
  const amanhaISO = addDias(hoje, 1);

  let query = supabase
    .from("agendamentos")
    .select("*, profissional:profissional_id(id, nome), servico:servico_id(id, nome)")
    .eq("profissional_id", profile.id)
    .eq("status", "agendado")
    .order("data", { ascending: true })
    .order("hora_inicio", { ascending: true });

  query = filtroData ? query.eq("data", filtroData) : query.gte("data", hoje);

  const [{ data: agendamentos }, { data: profissionais }] = await Promise.all([
    query as unknown as Promise<{ data: AgendamentoComRelacoes[] | null }>,
    supabase.from("profiles").select("*").order("nome") as unknown as Promise<{
      data: Profile[] | null;
    }>,
  ]);

  const grupos = new Map<string, AgendamentoComRelacoes[]>();
  for (const ag of agendamentos ?? []) {
    const lista = grupos.get(ag.data) ?? [];
    lista.push(ag);
    grupos.set(ag.data, lista);
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {podeVerAgendaGeral(profile) && (
              <Link href="/agendamentos" className="text-sm text-muted hover:text-accent-2">
                ← Agenda
              </Link>
            )}
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Minha agenda</h1>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form className="flex items-center gap-2">
              <input
                type="date"
                name="data"
                defaultValue={filtroData ?? ""}
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2 sm:flex-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
              >
                Filtrar
              </button>
              {filtroData && (
                <Link
                  href="/agendamentos/minha"
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

        <div className="mt-6 space-y-6">
          {Array.from(grupos.entries()).map(([data, itens]) => (
            <div key={data}>
              <h2 className="text-sm font-medium capitalize text-muted">
                {formatarCabecalhoData(data, hoje, amanhaISO)}
              </h2>
              <div className="mt-2 space-y-2">
                {itens.map((ag) => (
                  <div
                    key={ag.id}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        {ag.hora_inicio.slice(0, 5)}–{ag.hora_fim.slice(0, 5)} · {ag.cliente_nome}
                      </div>
                      <div className="text-sm text-muted">
                        {ag.servico?.nome ?? "—"}
                        {ag.cliente_contato && ` · ${ag.cliente_contato}`}
                      </div>
                    </div>
                    <AgendamentoAcoes
                      agendamentoId={ag.id}
                      status={ag.status}
                      profissionalAtualId={ag.profissional_id}
                      profissionais={profissionais ?? []}
                      podeTransferir={podeVerAgendaGeral(profile)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {grupos.size === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-muted">
              {filtroData
                ? "Nenhum agendamento marcado pra você nesse dia."
                : "Nenhum agendamento marcado pra você."}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
