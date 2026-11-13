"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { resetarSenha } from "../actions";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [error, formAction, pending] = useActionState(resetarSenha, null);
  const formRef = useRef<HTMLFormElement>(null);
  const prevPending = useRef(pending);
  const [sucesso, setSucesso] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    if (prevPending.current && !pending && !error) {
      formRef.current?.reset();
      setSucesso(true);
      const t = setTimeout(() => setSucesso(false), 3000);
      return () => clearTimeout(t);
    }
    prevPending.current = pending;
  }, [pending, error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <input type="hidden" name="id" value={userId} />
      <label className="block text-sm font-medium text-foreground">Resetar senha</label>
      <p className="mt-0.5 text-xs text-muted">
        Define uma nova senha de acesso pra este profissional. A antiga para de funcionar na hora.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          name="password"
          type={mostrarSenha ? "text" : "password"}
          minLength={6}
          required
          placeholder="Nova senha (mín. 6 caracteres)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
        <button
          type="button"
          onClick={() => setMostrarSenha((v) => !v)}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
        >
          {mostrarSenha ? "Ocultar" : "Mostrar"}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent-2 hover:text-accent-2 disabled:opacity-60"
        >
          {pending ? "Trocando..." : "Trocar senha"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {sucesso && <p className="mt-2 text-sm text-emerald-400">Senha alterada com sucesso.</p>}
    </form>
  );
}
