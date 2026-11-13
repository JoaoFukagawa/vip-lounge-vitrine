"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarPagamentoComissao } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function RegistrarPagamentoComissao({
  profissionalId,
  profissionalNome,
  de,
  ate,
  totalPrevisto,
  hojeISO,
}: {
  profissionalId: string;
  profissionalNome: string;
  de: string;
  ate: string;
  totalPrevisto: number;
  hojeISO: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [dataPagamento, setDataPagamento] = useState(hojeISO);
  const [doCaixa, setDoCaixa] = useState(false);

  const registrar = () => {
    const confirmado = confirm(
      `Registrar pagamento de ${brl(totalPrevisto)} pra ${profissionalNome} (${de} a ${ate})?\n\n` +
        `Isso vai criar uma despesa nessa data e marcar todas as comissões desse período como pagas.`
    );
    if (!confirmado) return;

    setErro(null);
    startTransition(async () => {
      const r = await registrarPagamentoComissao(profissionalId, de, ate, dataPagamento, doCaixa);
      if (!r.ok) {
        setErro(r.erro);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted">Data do pagamento:</label>
        <input
          type="date"
          value={dataPagamento}
          onChange={(e) => setDataPagamento(e.target.value)}
          className="rounded-lg border border-border bg-card px-2 py-1 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={doCaixa}
          onChange={(e) => setDoCaixa(e.target.checked)}
          className="accent-accent-2"
        />
        Paguei com o dinheiro da gaveta do caixa
      </label>
      <button
        type="button"
        onClick={registrar}
        disabled={pending}
        className="brand-gradient glow-accent rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Registrando..." : "Registrar pagamento"}
      </button>
      {erro && <p className="max-w-xs text-right text-xs text-danger">{erro}</p>}
    </div>
  );
}
