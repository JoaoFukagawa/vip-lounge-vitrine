"use client";

import { useActionState, useState } from "react";
import { atualizarProfile } from "../actions";
import type { Profile, ProfissionalHorario, Servico } from "@/lib/types";

const DIAS = [
  { valor: 0, rotulo: "Domingo" },
  { valor: 1, rotulo: "Segunda" },
  { valor: 2, rotulo: "Terça" },
  { valor: 3, rotulo: "Quarta" },
  { valor: 4, rotulo: "Quinta" },
  { valor: 5, rotulo: "Sexta" },
  { valor: 6, rotulo: "Sábado" },
];

function DiaHorarioRow({
  dia,
  rotulo,
  horario,
}: {
  dia: number;
  rotulo: string;
  horario?: ProfissionalHorario;
}) {
  const [trabalha, setTrabalha] = useState(!!horario);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <label className="flex w-28 shrink-0 items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name={`trabalha_${dia}`}
          checked={trabalha}
          onChange={(e) => setTrabalha(e.target.checked)}
          className="accent-accent-2"
        />
        {rotulo}
      </label>
      {trabalha ? (
        <div className="flex items-center gap-2">
          <input
            type="time"
            name={`inicio_${dia}`}
            defaultValue={horario?.horario_inicio.slice(0, 5) ?? "09:00"}
            required
            className="rounded border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-accent-2"
          />
          <span className="text-sm text-muted">até</span>
          <input
            type="time"
            name={`fim_${dia}`}
            defaultValue={horario?.horario_fim.slice(0, 5) ?? "19:00"}
            required
            className="rounded border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-accent-2"
          />
        </div>
      ) : (
        <span className="text-sm text-muted">Folga</span>
      )}
    </div>
  );
}

export function EditProfileForm({
  profile,
  servicos,
  horarios,
}: {
  profile: Profile;
  servicos: Servico[];
  horarios: ProfissionalHorario[];
}) {
  const [error, formAction, pending] = useActionState(atualizarProfile, null);
  const horarioPorDia = new Map(horarios.map((h) => [h.dia_semana, h]));

  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={profile.id} />

      <div>
        <label className="block text-sm font-medium text-foreground">Nome</label>
        <input
          name="nome"
          defaultValue={profile.nome}
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Tipo</label>
        <select
          name="role"
          defaultValue={profile.role}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        >
          <option className="bg-card" value="staff">
            Profissional
          </option>
          <option className="bg-card" value="recepcionista">
            Recepcionista
          </option>
          <option className="bg-card" value="admin">
            Administrador
          </option>
        </select>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:col-span-2">
        <input
          type="checkbox"
          name="isenta_parte_salao"
          defaultChecked={profile.isenta_parte_salao}
          className="mt-0.5 accent-accent-2"
        />
        <span>
          Proprietária — não descontar a parte do salão
          <span className="block text-xs text-muted">
            Fica com 100% dos serviços dela nas comissões (a taxa da maquininha continua sendo
            descontada).
          </span>
        </span>
      </label>

      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground">
          Horário de trabalho
        </label>
        <p className="mt-0.5 text-xs text-muted">
          Cada dia pode ter um horário diferente — a agenda só deixa marcar atendimento
          dentro desses horários.
        </p>
        <div className="mt-2 space-y-2">
          {DIAS.map((dia) => (
            <DiaHorarioRow
              key={dia.valor}
              dia={dia.valor}
              rotulo={dia.rotulo}
              horario={horarioPorDia.get(dia.valor)}
            />
          ))}
        </div>
      </div>

      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground">Especialidades</label>
        <div className="mt-2 flex flex-wrap gap-3">
          {servicos.map((servico) => (
            <label
              key={servico.id}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
            >
              <input
                type="checkbox"
                name="especialidades"
                value={servico.nome}
                defaultChecked={profile.especialidades.includes(servico.nome)}
                className="accent-accent-2"
              />
              {servico.nome}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="brand-gradient glow-accent rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
