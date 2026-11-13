"use client";

import { useState, useTransition } from "react";
import { atualizarServico, excluirServico } from "./actions";
import type { Servico } from "@/lib/types";

export function ServicoRow({ servico }: { servico: Servico }) {
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
    <tr className="transition-colors hover:bg-card-hover">
      <td className="px-4 py-2">{servico.nome}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <input
            value={comissao}
            onChange={(e) => setComissao(e.target.value)}
            onBlur={salvarComissao}
            inputMode="decimal"
            className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
          <span className="text-muted">%</span>
        </div>
      </td>
      <td className="px-4 py-2">
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
      </td>
      <td className="px-4 py-2 text-right">
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
      </td>
    </tr>
  );
}
