"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarCategoria } from "./actions";
import type { DespesaGrupo } from "@/lib/types";

export function NovaCategoriaForm({ grupos }: { grupos: DespesaGrupo[] }) {
  const [erro, formAction, pending] = useActionState(criarCategoria, null);
  const formRef = useRef<HTMLFormElement>(null);
  const prevPending = useRef(pending);

  useEffect(() => {
    if (prevPending.current && !pending && !erro) {
      formRef.current?.reset();
    }
    prevPending.current = pending;
  }, [pending, erro]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[200px_1fr_auto] sm:items-end"
    >
      <div>
        <label className="block text-sm font-medium text-foreground">Grupo</label>
        <select
          name="grupo_id"
          required
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        >
          <option value="">Selecione...</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Nova categoria</label>
        <input
          name="nome"
          required
          placeholder='Ex: "Estoque de café"'
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

      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-3">
          {erro}
        </p>
      )}
    </form>
  );
}
