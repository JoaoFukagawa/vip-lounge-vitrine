import { IS_DEMO } from "@/lib/demo";
import { signOut } from "@/app/login/actions";

// Faixa do modo demonstração (dados fictícios, alterações só no navegador do visitante).
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="brand-gradient text-accent-foreground">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5 text-center text-xs font-medium">
        <span>Demonstração com dados fictícios: pode testar à vontade, o que você muda fica só no seu navegador.</span>
        <span className="flex items-center gap-3">
          <form action={signOut}>
            <button type="submit" className="underline underline-offset-2 hover:opacity-80">
              Trocar de perfil
            </button>
          </form>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/demo/reset" className="underline underline-offset-2 hover:opacity-80">
            Restaurar dados
          </a>
        </span>
      </div>
    </div>
  );
}
