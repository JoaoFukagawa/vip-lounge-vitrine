"use client";

import { useState, useTransition } from "react";
import { corrigirProfissional } from "@/app/comandas/actions";

type Item = {
  id: string;
  servico: string;
  valor: number;
  profissional_id: string | null;
  comissao_pago_em: string | null;
};

function LinhaItem({ item, profissionais }: { item: Item; profissionais: { id: string; nome: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [escolhida, setEscolhida] = useState(item.profissional_id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const nome = (id: string | null) => profissionais.find((p) => p.id === id)?.nome ?? "sem profissional";

  const salvar = () => {
    if (!escolhida || escolhida === item.profissional_id) return;
    const aviso = item.comissao_pago_em
      ? `\n\nA comissão desse serviço JÁ FOI PAGA para ${nome(item.profissional_id)}. Ela volta a ficar pendente para ${nome(escolhida)}, e o pagamento feito para ${nome(item.profissional_id)} continua registrado em Despesas — acerte a diferença com ela.`
      : "";
    if (!confirm(`Trocar a profissional de "${item.servico}" de ${nome(item.profissional_id)} para ${nome(escolhida)}?${aviso}`)) return;
    setMsg(null);
    startTransition(async () => {
      const r = await corrigirProfissional(item.id, escolhida);
      setMsg(r.error ?? "Profissional corrigida.");
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="min-w-[140px] flex-1 text-foreground">
        {item.servico} ·{" "}
        {Number(item.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        {item.comissao_pago_em && <span className="ml-2 text-xs text-muted">(comissão paga)</span>}
      </span>
      <select
        value={escolhida}
        onChange={(e) => setEscolhida(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent-2"
      >
        <option value="" disabled>
          Selecione...
        </option>
        {profissionais.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={salvar}
        disabled={pending || !escolhida || escolhida === item.profissional_id}
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2 disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Trocar"}
      </button>
      {msg && <span className="w-full text-xs text-muted">{msg}</span>}
    </li>
  );
}

export function CorrigirProfissional({
  itens,
  profissionais,
}: {
  itens: Item[];
  profissionais: { id: string; nome: string }[];
}) {
  if (itens.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-foreground">Corrigir profissional</h2>
      <p className="mt-0.5 text-xs text-muted">
        Só a administração vê. Troca de quem é a comissão do serviço — os valores do caixa não mudam.
      </p>
      <ul className="mt-2 divide-y divide-border">
        {itens.map((i) => (
          <LinhaItem key={i.id} item={i} profissionais={profissionais} />
        ))}
      </ul>
    </section>
  );
}
