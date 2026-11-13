"use client";

import { useState, useTransition } from "react";
import { atualizarServico, excluirServico } from "./actions";
import type { Servico } from "@/lib/types";

export function ServicoCard({ servico }: { servico: Servico }) {
  const [comissao, setComissao] = useState(String(servico.comissao_percentual));
  const [ativo, setAtivo] = useState(servico.ativo);
  const [, startUpdateTransition] = useTransition();
  const [isExcluindo, startExcluirTransition] = useTransition();

  function salvarComissao() {
    const valor = parseFloat(comissao.replace(",", "."));
    if (isNaN(valor) || valor < 0 || valor > 100) {
      setComissao(String(servico.comissao_percentual));
      return;
    }
    startUpdateTransition(() => atualizarServico(servico.id, { comissaoPercentual: valor }));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {servico.nome}
        </span>
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
          Ativo
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => {
              setAtivo(e.target.checked);
              startUpdateTransition(() =>
                atualizarServico(servico.id, { ativo: e.target.checked })
              );
            }}
            className="accent-accent-2"
          />
        </label>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted">Comissão</span>
          <input
            value={comissao}
            onChange={(e) => setComissao(e.target.value)}
            onBlur={salvarComissao}
            inputMode="decimal"
            className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
          <span className="text-muted">%</span>
        </div>
        <button
          type="button"
          disabled={isExcluindo}
          onClick={() => {
            if (confirm(`Excluir o serviço "${servico.nome}"?`)) {
              startExcluirTransition(() => excluirServico(servico.id));
            }
          }}
          className="text-sm text-danger/80 transition-colors hover:text-danger disabled:opacity-60 disabled:cursor-wait"
        >
          {isExcluindo ? "Excluindo..." : "Excluir"}
        </button>
      </div>
    </div>
  );
}
