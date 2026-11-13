"use client";

import { useActionState } from "react";
import { atualizarTaxaCartao } from "./actions";
import type { TaxaCartao } from "@/lib/types";

export function TaxaCartaoForm({ taxas }: { taxas: TaxaCartao[] }) {
  const [error, formAction, pending] = useActionState(atualizarTaxaCartao, null);
  const debito = taxas.find((t) => t.tipo === "debito")?.taxa_percentual ?? 0;
  const credito = taxas.find((t) => t.tipo === "credito")?.taxa_percentual ?? 0;

  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      <div>
        <label className="block text-sm font-medium text-foreground">
          Débito — taxa (%)
        </label>
        <input
          name="debito"
          inputMode="decimal"
          defaultValue={debito}
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">
          Crédito — taxa (%)
        </label>
        <input
          name="credito"
          inputMode="decimal"
          defaultValue={credito}
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
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
          {pending ? "Salvando..." : "Salvar taxas"}
        </button>
      </div>
    </form>
  );
}
