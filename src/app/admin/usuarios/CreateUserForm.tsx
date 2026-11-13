"use client";

import { useActionState, useRef, useEffect } from "react";
import { createUser } from "./actions";

export function CreateUserForm() {
  const [error, formAction, pending] = useActionState(createUser, null);
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
      className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      <div>
        <label className="block text-sm font-medium text-foreground">Nome</label>
        <input
          name="nome"
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Usuário</label>
        <input
          name="username"
          required
          placeholder="ex: maria"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Senha</label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Tipo</label>
        <select
          name="role"
          defaultValue="staff"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        >
          <option className="bg-card" value="staff">
            Profissional
          </option>
          <option className="bg-card" value="recepcionista">
            Recepcionista
          </option>
          <option className="bg-card" value="admin">
            Administrador
          </option>
        </select>
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
          {pending ? "Criando..." : "Criar usuário"}
        </button>
      </div>
    </form>
  );
}
