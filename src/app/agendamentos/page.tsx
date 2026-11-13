import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { CalendarioAgenda, type Bloco, type Coluna } from "@/components/CalendarioAgenda";
import { addDias, hojeSP } from "@/lib/data";
import { podeVerAgendaGeral } from "@/lib/permissoes";
import type { Profile, ProfissionalHorario } from "@/lib/types";

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToLabel(min: number) {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const PX_POR_MINUTO = 1.4;
const ALTURA_MIN_BLOCO = 30;
const FALLBACK_INICIO = 9 * 60;
const FALLBACK_FIM = 19 * 60;

type AgendamentoRow = {
  id: string;
  data: string;
  hora_inicio: string;
  duracao_minutos: number;
  cliente_nome: string;
  status: string;
  observacoes: string | null;
  profissional_id: string;
  servico: { id: string; nome: string } | null;
};

export default async function AgendamentosCalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: dataParam } = await searchParams;
  const data = dataParam || hojeSP();
  const diaSemana = new Date(data + "T00:00:00").getDay();

  const supabase = await createClient();
  const [profile, { data: profissionais }, { data: horarios }, { data: agendamentos }] =
    await Promise.all([
      getCurrentProfile(),
      supabase
        .from("profiles")
        .select("*")
        .eq("ativo", true)
        .order("nome") as unknown as Promise<{ data: Profile[] | null }>,
      supabase
        .from("profissional_horarios")
        .select("*")
        .eq("dia_semana", diaSemana) as unknown as Promise<{ data: ProfissionalHorario[] | null }>,
      supabase
        .from("agendamentos")
        .select(
          "id, data, hora_inicio, duracao_minutos, cliente_nome, status, observacoes, profissional_id, servico:servico_id(id, nome)"
        )
        .eq("data", data)
        .order("hora_inicio") as unknown as Promise<{ data: AgendamentoRow[] | null }>,
    ]);

  if (!profile) redirect("/login");
  if (!podeVerAgendaGeral(profile)) redirect("/agendamentos/minha");

  const listaProfissionais = profissionais ?? [];
  const horarioPorProfissional = new Map((horarios ?? []).map((h) => [h.profissional_id, h]));

  let minInicio = Infinity;
  let maxFim = -Infinity;
  for (const h of horarios ?? []) {
    minInicio = Math.min(minInicio, timeToMinutes(h.horario_inicio));
    maxFim = Math.max(maxFim, timeToMinutes(h.horario_fim));
  }
  for (const ag of agendamentos ?? []) {
    const inicio = timeToMinutes(ag.hora_inicio);
    minInicio = Math.min(minInicio, inicio);
    maxFim = Math.max(maxFim, inicio + ag.duracao_minutos);
  }
  if (!isFinite(minInicio)) {
    minInicio = FALLBACK_INICIO;
    maxFim = FALLBACK_FIM;
  }
  // Arredonda pra hora cheia, com uma margem de 30min em cada ponta.
  minInicio = Math.floor((minInicio - 30) / 60) * 60;
  maxFim = Math.ceil((maxFim + 30) / 60) * 60;

  const alturaTotal = (maxFim - minInicio) * PX_POR_MINUTO;

  const marcasHora: { top: number; label: string }[] = [];
  for (let m = minInicio; m <= maxFim; m += 60) {
    marcasHora.push({ top: (m - minInicio) * PX_POR_MINUTO, label: minutesToLabel(m) });
  }

  const colunas: Coluna[] = listaProfissionais.map((p) => {
    const horario = horarioPorProfissional.get(p.id);
    const blocos: Bloco[] = (agendamentos ?? [])
      .filter((ag) => ag.profissional_id === p.id)
      .map((ag) => {
        const inicioMin = timeToMinutes(ag.hora_inicio);
        return {
          id: ag.id,
          clienteNome: ag.cliente_nome,
          servicoNome: ag.servico?.nome ?? null,
          horaInicio: ag.hora_inicio.slice(0, 5),
          horaFim: minutesToLabel(inicioMin + ag.duracao_minutos),
          status: ag.status,
          observacoes: ag.observacoes,
          profissionalId: ag.profissional_id,
          top: (inicioMin - minInicio) * PX_POR_MINUTO,
          height: Math.max(ag.duracao_minutos * PX_POR_MINUTO, ALTURA_MIN_BLOCO),
        };
      });
    return {
      profissional: p,
      trabalhaHoje: !!horario,
      horarioLabel: horario
        ? `${horario.horario_inicio.slice(0, 5)} – ${horario.horario_fim.slice(0, 5)}`
        : null,
      blocos,
    };
  });

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/agendamentos/lista"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
            >
              Ver lista
            </Link>
            <Link
              href="/agendamentos/minha"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
            >
              Minha agenda
            </Link>
            <Link
              href="/agendamentos/nova"
              className="brand-gradient glow-accent rounded-lg px-4 py-2 text-center text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              + Novo agendamento
            </Link>
          </div>
        </div>

        <CalendarioAgenda
          data={data}
          dataAnterior={addDias(data, -1)}
          dataSeguinte={addDias(data, 1)}
          hoje={hojeSP()}
          colunas={colunas}
          alturaTotal={alturaTotal}
          marcasHora={marcasHora}
          profissionais={listaProfissionais}
        />
      </main>
    </div>
  );
}
