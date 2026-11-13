import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { MobileNavDrawer } from "@/components/MobileNavDrawer";
import { DemoBanner } from "@/components/DemoBanner";
import { podeVerAgendaGeral, podeVerClientes } from "@/lib/permissoes";
import type { Profile } from "@/lib/types";

export function Header({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
      <DemoBanner />
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex items-center justify-between py-3">
          <Link
            href="/"
            className="brand-gradient-text text-sm font-bold tracking-[0.2em]"
          >
            VIP LOUNGE
          </Link>
          <div className="flex items-center gap-3 text-sm text-muted">
            <div className="hidden items-center gap-3 sm:flex">
              <span>{profile.nome}</span>
              <form action={signOut}>
                <button
                  className="rounded-lg border border-border px-3 py-1 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
                  type="submit"
                >
                  Sair
                </button>
              </form>
            </div>
            <MobileNavDrawer profile={profile} />
          </div>
        </div>

        {/* Desktop: nav horizontal — no celular a navegação vira a gaveta acima */}
        <nav className="hidden gap-5 overflow-x-auto border-t border-border py-2 text-sm text-muted sm:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
          >
            Comandas
          </Link>
          <Link
            href="/duplicatas"
            className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
          >
            Duplicatas
          </Link>
          {podeVerAgendaGeral(profile) && (
            <Link
              href="/agendamentos"
              className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
            >
              Agenda
            </Link>
          )}
          <Link
            href="/agendamentos/minha"
            className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
          >
            Minha agenda
          </Link>
          {podeVerClientes(profile) && (
            <Link
              href="/clientes"
              className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
            >
              Clientes
            </Link>
          )}
          {profile.role === "admin" && (
            <>
              <Link
                href="/caixa"
                className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
              >
                Caixa
              </Link>
              <Link
                href="/comissoes"
                className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
              >
                Comissões
              </Link>
              <Link
                href="/despesas"
                className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
              >
                Despesas
              </Link>
              <Link
                href="/financeiro"
                className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
              >
                Financeiro
              </Link>
              <Link
                href="/admin"
                className="shrink-0 whitespace-nowrap transition-colors hover:text-accent-2"
              >
                Admin
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
