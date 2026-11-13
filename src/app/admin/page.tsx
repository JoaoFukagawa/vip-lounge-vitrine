import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { Header } from "@/components/Header";

const CARDS = [
  {
    href: "/admin/usuarios",
    titulo: "Usuários",
    descricao: "Cadastrar profissionais, editar perfil, horários e especialidades.",
  },
  {
    href: "/admin/servicos",
    titulo: "Serviços",
    descricao: "Nome, comissão e duração padrão de cada serviço.",
  },
  {
    href: "/admin/taxas",
    titulo: "Taxas de cartão",
    descricao: "Percentual de débito e crédito descontado da comissão.",
  },
  {
    href: "/admin/categorias-despesa",
    titulo: "Categorias de despesa",
    descricao: "Editar, adicionar ou desativar categorias usadas nas despesas.",
  },
] as const;

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted">Configurações gerais do salão.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-card-hover"
            >
              <div className="font-medium text-foreground">{card.titulo}</div>
              <p className="mt-1 text-sm text-muted">{card.descricao}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
