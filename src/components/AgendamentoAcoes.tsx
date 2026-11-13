"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  cancelarAgendamento,
  marcarNaoCompareceu,
  transferirAgendamento,
} from "@/app/agendamentos/actions";
import type { Profile } from "@/lib/types";

export function AgendamentoAcoes({
  agendamentoId,
  status,
  profissionalAtualId,
  profissionais,
  podeTransferir = true,
}: {
  agendamentoId: string;
  status: string;
  profissionalAtualId: string;
  profissionais: Profile[];
  podeTransferir?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [acaoAtual, setAcaoAtual] = useState<"nao_compareceu" | "cancelar" | null>(null);
  const [transferindo, setTransferindo] = useState(false);
  const [novoProfissionalId, setNovoProfissionalId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const outrosProfissionais = profissionais.filter(
    (p) => p.ativo && p.id !== profissionalAtualId
  );

  if (status !== "agendado") {
    return <span className="text-sm text-muted">—</span>;
  }

  if (transferindo) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
        <select
          value={novoProfissionalId}
          onChange={(e) => setNovoProfissionalId(e.target.value)}
          className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-accent-2"
        >
          <option value="">Novo profissional...</option>
          {outrosProfissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)"
          className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-accent-2"
        />
        {erro && <p className="text-xs text-danger">{erro}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending || !novoProfissionalId}
            onClick={() =>
              startTransition(async () => {
                const resultado = await transferirAgendamento(
                  agendamentoId,
                  novoProfissionalId,
                  motivo
                );
                if (resultado?.error) setErro(resultado.error);
                else setTransferindo(false);
              })
            }
            className="rounded bg-accent-2 px-2 py-1 text-xs font-medium text-accent-foreground disabled:opacity-60 disabled:cursor-wait"
          >
            {isPending ? "Transferindo..." : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setTransferindo(false);
              setErro(null);
            }}
            className="rounded border border-border px-2 py-1 text-xs text-muted"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <Link
        href={`/comandas/nova?agendamentoId=${agendamentoId}`}
        className="text-accent-2 transition-colors hover:opacity-80"
      >
        Concluir
      </Link>
      {podeTransferir && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setTransferindo(true)}
          className="text-muted transition-colors hover:text-accent-2 disabled:opacity-60"
        >
          Transferir
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setAcaoAtual("nao_compareceu");
          startTransition(() => marcarNaoCompareceu(agendamentoId));
        }}
        className="text-muted transition-colors hover:text-accent-2 disabled:opacity-60 disabled:cursor-wait"
      >
        {isPending && acaoAtual === "nao_compareceu" ? "Marcando..." : "Não veio"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          const motivoCancelamento = prompt("Motivo do cancelamento (opcional):") ?? "";
          if (confirm("Cancelar este agendamento?")) {
            setAcaoAtual("cancelar");
            startTransition(() => cancelarAgendamento(agendamentoId, motivoCancelamento));
          }
        }}
        className="text-danger/80 transition-colors hover:text-danger disabled:opacity-60 disabled:cursor-wait"
      >
        {isPending && acaoAtual === "cancelar" ? "Cancelando..." : "Cancelar"}
      </button>
    </div>
  );
}
