"use client";

import { useActionState, useRef, useEffect } from "react";
import { createServico } from "./actions";

export function CreateServicoForm() {
  const [error, formAction, pending] = useActionState(createServico, null);
  const formRef = useRef<HTMLFormElement>(null);
  const prevPending = useRef(pending);

  useEffect(() => {
    if (prevPending.current && !pending && !error) {
      formRef.current?.reset();
    }
    prevPending.current = pending;
  }, [pending, error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[1fr_140px_auto] sm:items-end"
    >
      <div>
        <label className="block text-sm font-medium text-foreground">
          Nome do serviço
        </label>
        <input
          name="nome"
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">
          Comissão (%)
        </label>
        <input
          name="comissao"
          inputMode="decimal"
          defaultValue="30"
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="brand-gradient glow-accent rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Adicionando..." : "Adicionar"}
      </button>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
