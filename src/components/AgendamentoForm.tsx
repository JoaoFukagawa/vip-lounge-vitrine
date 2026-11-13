"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarAgendamento } from "@/app/agendamentos/actions";
import { criarCliente } from "@/app/clientes/actions";
import { ClienteAutocomplete } from "@/components/ClienteAutocomplete";
import { hojeSP } from "@/lib/data";
import type { Profile, ProfissionalHorario, Servico } from "@/lib/types";

const NOMES_DIA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function AgendamentoForm({
  profile,
  profissionais,
  servicos,
  horarios,
  dataInicial,
}: {
  profile: Profile;
  profissionais: Profile[];
  servicos: Servico[];
  horarios: ProfissionalHorario[];
  dataInicial?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const travadaEmSiMesma = profile.role === "staff";

  const [clienteNome, setClienteNome] = useState("");
  const [clienteContato, setClienteContato] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [data, setData] = useState(dataInicial ?? hojeSP());
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [servicoId, setServicoId] = useState("");
  const [profissionalId, setProfissionalId] = useState(
    travadaEmSiMesma ? profile.id : ""
  );
  const [duracaoMinutos, setDuracaoMinutos] = useState("60");
  const [observacoes, setObservacoes] = useState("");

  const profissionaisAtivos = useMemo(
    () => profissionais.filter((p) => p.ativo),
    [profissionais]
  );

  const horarioDoDia = useMemo(() => {
    if (!profissionalId || !data) return undefined;
    const diaSemana = new Date(data + "T00:00:00").getDay();
    return horarios.find(
      (h) => h.profissional_id === profissionalId && h.dia_semana === diaSemana
    );
  }, [horarios, profissionalId, data]);

  const avisoHorario = useMemo(() => {
    if (!profissionalId || !data) return null;
    const diaSemana = new Date(data + "T00:00:00").getDay();
    if (!horarioDoDia) {
      return `Essa profissional está de folga — não trabalha ${NOMES_DIA[diaSemana]}.`;
    }
    return `Horário de trabalho: ${horarioDoDia.horario_inicio.slice(0, 5)} às ${horarioDoDia.horario_fim.slice(0, 5)}.`;
  }, [horarioDoDia, profissionalId, data]);

  function onServicoChange(id: string) {
    setServicoId(id);
    const servico = servicos.find((s) => s.id === id);
    if (servico) setDuracaoMinutos(String(servico.duracao_minutos));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const duracao = parseInt(duracaoMinutos, 10);

    startTransition(async () => {
      let idCliente = clienteId;

      if (!idCliente && clienteNome.trim()) {
        const confirmado = confirm(
          `Não encontramos "${clienteNome.trim()}" cadastrada. Cadastrar como nova cliente?`
        );
        if (!confirmado) {
          setErro("Corrija o nome ou escolha uma cliente da lista de sugestões.");
          return;
        }
        const resultadoCliente = await criarCliente(clienteNome, clienteContato);
        if (!resultadoCliente.ok) {
          setErro(resultadoCliente.error);
          return;
        }
        idCliente = resultadoCliente.id;
        setClienteId(idCliente);
      }

      const resultado = await criarAgendamento({
        data,
        horaInicio,
        duracaoMinutos: isNaN(duracao) ? 60 : duracao,
        clienteNome,
        clienteContato,
        clienteId: idCliente,
        profissionalId,
        servicoId: servicoId || null,
        observacoes,
      });
      if (resultado?.error) setErro(resultado.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground">Cliente</label>
          <div className="mt-1">
            <ClienteAutocomplete
              nome={clienteNome}
              onNomeChange={setClienteNome}
              onLimparCliente={() => setClienteId(null)}
              clienteVinculado={!!clienteId}
              required
              onSelecionarCliente={(c) => {
                setClienteNome(c.nome);
                if (!clienteContato.trim() && c.contato) setClienteContato(c.contato);
                setClienteId(c.id);
              }}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Contato</label>
          <input
            value={clienteContato}
            onChange={(e) => setClienteContato(e.target.value)}
            placeholder="WhatsApp, telefone..."
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">Data</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Hora</label>
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">Serviço</label>
          <select
            value={servicoId}
            onChange={(e) => onServicoChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          >
            <option value="">— nenhum —</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Duração (min)</label>
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={duracaoMinutos}
            onChange={(e) => setDuracaoMinutos(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground">Profissional</label>
          {travadaEmSiMesma ? (
            <div className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted">
              {profile.nome}{" "}
              <span className="text-xs">(você só agenda pra si mesma)</span>
            </div>
          ) : (
            <select
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
            >
              <option value="">Selecione...</option>
              {profissionaisAtivos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          )}
          {avisoHorario && (
            <p
              className={`mt-1.5 text-xs ${horarioDoDia ? "text-muted" : "text-danger"}`}
            >
              {avisoHorario}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-foreground">Observações</label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
        </div>
      </div>

      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="brand-gradient glow-accent rounded-lg px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Salvando..." : "Criar agendamento"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
