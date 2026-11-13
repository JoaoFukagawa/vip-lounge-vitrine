"use client";

import { useTransition } from "react";
import { marcarDespesaPaga, excluirDespesa } from "./actions";
import type { Despesa } from "@/lib/types";

export function DespesaAcoes({ despesa, hojeISO }: { despesa: Despesa; hojeISO: string }) {
  const [pending, startTransition] = useTransition();

  const marcarPaga = () => {
    if (!confirm("Marcar essa despesa como paga hoje?")) return;
    startTransition(() => {
      marcarDespesaPaga(despesa.id, hojeISO);
    });
  };

  const excluir = () => {
    if (!confirm("Excluir essa despesa? Essa ação não pode ser desfeita.")) return;
    startTransition(async () => {
      const r = await excluirDespesa(despesa.id);
      if (r?.error) alert(r.error);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {despesa.status === "a_pagar" && (
        <button
          type="button"
          disabled={pending}
          onClick={marcarPaga}
          className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-sm text-accent-2 transition-colors hover:bg-accent-2/20 disabled:opacity-60"
        >
          Marcar como paga
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={excluir}
        className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger/20 disabled:opacity-60"
      >
        Excluir
      </button>
    </div>
  );
}
