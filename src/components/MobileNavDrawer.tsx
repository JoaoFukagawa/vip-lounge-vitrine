"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { podeVerAgendaGeral, podeVerClientes } from "@/lib/permissoes";
import type { Profile } from "@/lib/types";

const ITEM_CLASS =
  "rounded-lg px-3 py-2.5 text-[15px] text-foreground transition-colors hover:bg-card hover:text-accent-2";
const SECAO_CLASS = "mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted";

export function MobileNavDrawer({ profile }: { profile: Profile }) {
  const [aberto, setAberto] = useState(false);
  const isAdmin = profile.role === "admin";
  const veAgenda = podeVerAgendaGeral(profile);
  const veClientes = podeVerClientes(profile);
  const fechar = () => setAberto(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        className="flex flex-col gap-1 p-1.5"
      >
        <span className="block h-0.5 w-5 rounded bg-foreground" />
        <span className="block h-0.5 w-5 rounded bg-foreground" />
        <span className="block h-0.5 w-5 rounded bg-foreground" />
      </button>

      {aberto &&
        createPortal(
          <div
            className="fixed inset-0 z-30 flex justify-end bg-black/50"
            onClick={fechar}
          >
            <div
              className="flex h-full w-72 max-w-[85vw] flex-col bg-background p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-medium text-foreground">{profile.nome}</span>
                <button
                  type="button"
                  onClick={fechar}
                  aria-label="Fechar menu"
                  className="shrink-0 rounded-lg p-1.5 text-muted hover:text-accent-2"
                >
                  ✕
                </button>
              </div>

              <nav className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto">
                <Link href="/" onClick={fechar} className={ITEM_CLASS}>
                  Comandas
                </Link>
                <Link href="/duplicatas" onClick={fechar} className={ITEM_CLASS}>
                  Duplicatas
                </Link>
                {veAgenda && (
                  <Link href="/agendamentos" onClick={fechar} className={ITEM_CLASS}>
                    Agenda
                  </Link>
                )}
                <Link href="/agendamentos/minha" onClick={fechar} className={ITEM_CLASS}>
                  Minha agenda
                </Link>

                {(veClientes || isAdmin) && <div className={SECAO_CLASS}>Relatórios</div>}
                {isAdmin && (
                  <>
                    <Link href="/caixa" onClick={fechar} className={ITEM_CLASS}>
                      Caixa
                    </Link>
                    <Link href="/comissoes" onClick={fechar} className={ITEM_CLASS}>
                      Comissões
                    </Link>
                    <Link href="/despesas" onClick={fechar} className={ITEM_CLASS}>
                      Despesas
                    </Link>
                    <Link href="/financeiro" onClick={fechar} className={ITEM_CLASS}>
                      Financeiro
                    </Link>
                  </>
                )}
                {veClientes && (
                  <Link href="/clientes" onClick={fechar} className={ITEM_CLASS}>
                    Clientes
                  </Link>
                )}

                {isAdmin && (
                  <>
                    <div className={SECAO_CLASS}>Configurações</div>
                    <Link href="/admin" onClick={fechar} className={ITEM_CLASS}>
                      Admin
                    </Link>
                  </>
                )}
              </nav>

              <form action={signOut} className="mt-4 pt-4">
                <button
                  type="submit"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
