"use client";

import { useState, useTransition } from "react";
import { conferirCaixa, reabrirCaixa } from "../actions";

export function ConferenciaAcoes({ sessaoId, temDiferenca }: { sessaoId: string; temDiferenca: boolean }) {
  const [pending, startTransition] = useTransition();
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const conferir = () => {
    setErro(null);
    startTransition(async () => {
      const r = await conferirCaixa(sessaoId, observacao.trim());
      if (r.error) setErro(r.error);
    });
  };

  const reabrir = () => {
    const motivo = prompt("Motivo da reabertura (ex: contei errado):");
    if (!motivo?.trim()) return;
    setErro(null);
    startTransition(async () => {
      const r = await reabrirCaixa(sessaoId, motivo.trim());
      if (r.error) setErro(r.error);
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <label className="block text-sm font-medium text-foreground">
          Observação {temDiferenca ? "(obrigatória: há diferença)" : "(opcional)"}
        </label>
        <input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent-2"
        />
      </div>
      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={conferir}
          disabled={pending}
          className="brand-gradient glow-accent rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Marcar como conferido
        </button>
        <button
          type="button"
          onClick={reabrir}
          disabled={pending}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2 disabled:opacity-60"
        >
          Reabrir caixa
        </button>
      </div>
    </div>
  );
}
