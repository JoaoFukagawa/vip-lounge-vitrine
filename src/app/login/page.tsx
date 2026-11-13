"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { IS_DEMO } from "@/lib/demo";

const PERFIS_DEMO = [
  { user: "admin", titulo: "Administração", detalhe: "Camila · dona do salão: caixa, comissões, financeiro" },
  { user: "recepcao", titulo: "Recepção", detalhe: "Juliana · agenda geral, comandas e clientes" },
  { user: "ana", titulo: "Profissional", detalhe: "Ana · a própria agenda e comandas" },
];

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-black/40">
        <h1 className="brand-gradient-text text-center text-2xl font-bold tracking-[0.2em]">
          VIP LOUNGE
        </h1>
        <p className="mt-1 text-center text-sm text-muted">
          Controle de Serviços
        </p>

        {IS_DEMO && (
          <div className="mt-6 space-y-2">
            <p className="text-center text-xs text-muted">
              Demonstração com dados fictícios. Escolha um perfil para entrar:
            </p>
            {PERFIS_DEMO.map((p) => (
              <form key={p.user} action={formAction}>
                <input type="hidden" name="username" value={p.user} />
                <input type="hidden" name="password" value="demo" />
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-accent-2 disabled:opacity-60"
                >
                  <span className="block text-sm font-medium text-foreground">{p.titulo}</span>
                  <span className="block text-xs text-muted">{p.detalhe}</span>
                </button>
              </form>
            ))}
            <p className="pt-2 text-center text-xs text-muted">ou entre com usuário e qualquer senha</p>
          </div>
        )}

        <form action={formAction} className={IS_DEMO ? "mt-4 space-y-4" : "mt-8 space-y-4"}>
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground">
              Usuário
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="brand-gradient glow-accent w-full rounded-lg py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
