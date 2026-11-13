"use client";

import { useState, useTransition } from "react";
import { desativarUsuario, reativarUsuario } from "../actions";

export function StatusUsuarioCard({
  userId,
  ativo,
  agendamentosFuturos,
}: {
  userId: string;
  ativo: boolean;
  agendamentosFuturos: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const bloqueado = ativo && agendamentosFuturos > 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              ativo ? "bg-emerald-500/15 text-emerald-400" : "bg-danger/15 text-danger"
            }`}
          >
            {ativo ? "Ativo" : "Inativo"}
          </span>
        </div>
        <button
          type="button"
          disabled={isPending || bloqueado}
          title={bloqueado ? "Transfira os agendamentos futuros antes de desativar" : undefined}
          onClick={() => {
            const confirmMsg = ativo
              ? "Desativar este profissional? Ele não vai mais aparecer para novos agendamentos."
              : "Reativar este profissional?";
            if (!confirm(confirmMsg)) return;
            setErro(null);
            startTransition(async () => {
              const resultado = ativo
                ? await desativarUsuario(userId)
                : await reativarUsuario(userId);
              if (resultado?.error) setErro(resultado.error);
            });
          }}
          className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            ativo
              ? "border-danger/30 text-danger hover:bg-danger/10"
              : "border-border text-muted hover:border-accent-2 hover:text-accent-2"
          }`}
        >
          {isPending ? "Salvando..." : ativo ? "Desativar" : "Reativar"}
        </button>
      </div>

      {ativo && agendamentosFuturos > 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Este profissional tem {agendamentosFuturos} agendamento
          {agendamentosFuturos > 1 ? "s" : ""} futuro{agendamentosFuturos > 1 ? "s" : ""}.
          Transfira-os na lista abaixo — o botão de desativar libera assim que não sobrar
          nenhum.
        </p>
      )}

      {erro && (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
