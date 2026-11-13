"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { DespesaCategoriaComGrupo, Despesa } from "@/lib/types";

const FORMAS_PAGAMENTO = [
  { valor: "", rotulo: "Não informada" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "PIX" },
  { valor: "debito", rotulo: "Cartão débito" },
  { valor: "credito", rotulo: "Cartão crédito" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "outro", rotulo: "Outro" },
] as const;

type Action = (
  prev: string | null,
  formData: FormData
) => Promise<string | null> | string | null;

type Props = {
  categorias: DespesaCategoriaComGrupo[];
  despesa?: Despesa;
  action: Action;
  submitLabel: string;
  pendingLabel: string;
  hojeISO: string;
  // Despesa nova com caixa aberto: oferece "saiu do dinheiro do caixa".
  caixaAberto?: boolean;
};

export function DespesaForm({
  categorias,
  despesa,
  action,
  submitLabel,
  pendingLabel,
  hojeISO,
  caixaAberto = false,
}: Props) {
  const [erro, formAction, pending] = useActionState(action, null);
  const [status, setStatus] = useState<"pago" | "a_pagar">(despesa?.status ?? "pago");
  const [forma, setForma] = useState<string>(despesa?.forma_pagamento ?? "");
  const ofereceCaixa = !despesa && caixaAberto && forma === "dinheiro" && status === "pago";

  // Agrupar categorias ativas por grupo pro <select> ficar organizado.
  const grupos = new Map<string, { nome: string; itens: DespesaCategoriaComGrupo[] }>();
  for (const cat of categorias) {
    if (!cat.ativa && cat.id !== despesa?.categoria_id) continue;
    const g = grupos.get(cat.grupo.id) ?? { nome: cat.grupo.nome, itens: [] };
    g.itens.push(cat);
    grupos.set(cat.grupo.id, g);
  }

  return (
    <form
      action={formAction}
      className="mt-6 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground">Descrição</label>
        <input
          name="descricao"
          required
          defaultValue={despesa?.descricao ?? ""}
          placeholder='Ex: "Aluguel novembro" ou "Tinta Wella"'
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground">Categoria</label>
        <select
          name="categoria_id"
          required
          defaultValue={despesa?.categoria_id ?? ""}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        >
          <option value="">Selecione...</option>
          {Array.from(grupos.values()).map((g) => (
            <optgroup key={g.nome} label={g.nome}>
              {g.itens.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {!c.ativa ? " (inativa)" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground">Valor (R$)</label>
        <input
          name="valor"
          inputMode="decimal"
          required
          defaultValue={despesa?.valor?.toString().replace(".", ",") ?? ""}
          placeholder="0,00"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground">Data</label>
        <input
          type="date"
          name="data"
          required
          defaultValue={despesa?.data ?? hojeISO}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground">Forma de pagamento</label>
        <select
          name="forma_pagamento"
          value={forma}
          onChange={(e) => setForma(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        >
          {FORMAS_PAGAMENTO.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground">Fornecedor</label>
        <input
          name="fornecedor"
          defaultValue={despesa?.fornecedor ?? ""}
          placeholder="Opcional"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground">Status</label>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "pago" | "a_pagar")}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        >
          <option value="pago">Já paga</option>
          <option value="a_pagar">A pagar (com vencimento)</option>
        </select>
      </div>

      {status === "a_pagar" && (
        <div>
          <label className="block text-sm font-medium text-foreground">Vencimento</label>
          <input
            type="date"
            name="data_vencimento"
            required
            defaultValue={despesa?.data_vencimento ?? ""}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
        </div>
      )}

      {ofereceCaixa && (
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:col-span-2">
          <input type="checkbox" name="do_caixa" className="accent-accent-2" />
          Saiu do dinheiro da gaveta do caixa (desconta do caixa de hoje)
        </label>
      )}
      {despesa?.caixa_sessao_id && (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted sm:col-span-2">
          Esta despesa saiu do dinheiro do caixa. Depois que o caixa fecha, valor, forma e data
          não mudam mais.
        </p>
      )}

      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-foreground">Observações</label>
        <textarea
          name="observacoes"
          rows={2}
          defaultValue={despesa?.observacoes ?? ""}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>

      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2">
          {erro}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        <Link
          href="/despesas"
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="brand-gradient glow-accent rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
