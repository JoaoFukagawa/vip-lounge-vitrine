import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { AdminSubNav } from "@/components/AdminSubNav";
import { CreateUserForm } from "./CreateUserForm";
import { DeleteUserButton } from "./DeleteUserButton";
import { ROLE_LABEL } from "@/lib/permissoes";
import type { Profile } from "@/lib/types";

export default async function UsuariosPage() {
  const supabase = await createClient();
  const [profile, { data: usuarios }] = await Promise.all([
    getCurrentProfile(),
    supabase.from("profiles").select("*").order("nome") as unknown as Promise<{
      data: Profile[] | null;
    }>,
  ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <AdminSubNav ativo="/admin/usuarios" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 text-sm text-muted">
          Crie um usuário e senha para cada profissional do salão.
        </p>

        <div className="mt-6">
          <CreateUserForm />
        </div>

        {/* Mobile: cards */}
        <div className="mt-6 space-y-2 sm:hidden">
          {usuarios?.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div>
                <div className="font-medium text-foreground">
                  {u.nome}
                  {!u.ativo && (
                    <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted">
                  {ROLE_LABEL[u.role]}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/admin/usuarios/${u.id}`}
                  className="text-sm text-muted transition-colors hover:text-accent-2"
                >
                  Editar
                </Link>
                {u.id !== profile.id && <DeleteUserButton userId={u.id} />}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: tabela */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usuarios?.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-card-hover">
                    <td className="px-4 py-2">
                      {u.nome}
                      {!u.ativo && (
                        <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {ROLE_LABEL[u.role]}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/admin/usuarios/${u.id}`}
                          className="text-sm text-muted transition-colors hover:text-accent-2"
                        >
                          Editar
                        </Link>
                        {u.id !== profile.id && <DeleteUserButton userId={u.id} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
