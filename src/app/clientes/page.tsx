import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { chaveCliente, normalizarNome } from "@/lib/clientes";
import { hojeSP } from "@/lib/data";
import { podeVerClientes } from "@/lib/permissoes";
import { CampanhaWhatsApp } from "@/components/CampanhaWhatsApp";

type ComandaRow = {
  id: string;
  data: string;
  cliente_nome: string | null;
  cliente_contato: string | null;
  total: number;
};

type Grupo = {
  chave: string;
  nome: string;
  contato: string | null;
  visitas: number;
  totalGasto: number;
  ultimaVisita: string;
};

function diasEntre(dataISO: string, hojeISO: string) {
  const ms = new Date(hojeISO + "T00:00:00").getTime() - new Date(dataISO + "T00:00:00").getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; semVisitaDias?: string }>;
}) {
  const { q, semVisitaDias } = await searchParams;

  const supabase = await createClient();
  const [profile, { data: comandas }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("comandas")
      .select("id, data, cliente_nome, cliente_contato, total")
      .order("data", { ascending: false }) as unknown as Promise<{ data: ComandaRow[] | null }>,
  ]);

  if (!profile) redirect("/login");
  if (!podeVerClientes(profile)) redirect("/");

  const grupos = new Map<string, Grupo>();
  for (const c of comandas ?? []) {
    const nome = (c.cliente_nome ?? "").trim();
    if (!nome) continue;
    const chave = normalizarNome(nome);
    const atual = grupos.get(chave);
    if (!atual) {
      grupos.set(chave, {
        chave,
        nome,
        contato: c.cliente_contato,
        visitas: 1,
        totalGasto: c.total,
        ultimaVisita: c.data,
      });
    } else {
      atual.visitas += 1;
      atual.totalGasto += c.total;
      if (!atual.contato && c.cliente_contato) atual.contato = c.cliente_contato;
    }
  }

  let lista = Array.from(grupos.values());
  if (q?.trim()) {
    const termo = normalizarNome(q);
    lista = lista.filter((g) => normalizarNome(g.nome).includes(termo));
  }

  const hoje = hojeSP();
  const minDias = semVisitaDias ? parseInt(semVisitaDias, 10) : null;
  const listaInativas =
    minDias && !isNaN(minDias)
      ? lista
          .map((g) => ({ ...g, dias: diasEntre(g.ultimaVisita, hoje) }))
          .filter((g) => g.dias >= minDias)
          .sort((a, b) => b.dias - a.dias)
      : null;

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          <form className="flex items-center gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar por nome..."
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2 sm:w-64 sm:flex-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
            >
              Buscar
            </button>
            {q && (
              <Link
                href="/clientes"
                className="shrink-0 text-sm text-muted transition-colors hover:text-accent-2"
              >
                Limpar
              </Link>
            )}
          </form>
        </div>

        <form className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Sem visita há pelo menos</span>
          <input
            type="number"
            name="semVisitaDias"
            min={1}
            defaultValue={semVisitaDias ?? ""}
            placeholder="30"
            className="w-20 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
          <span className="text-sm text-muted">dias</span>
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
          >
            Filtrar
          </button>
          {semVisitaDias && (
            <Link
              href="/clientes"
              className="shrink-0 text-sm text-muted transition-colors hover:text-accent-2"
            >
              Limpar
            </Link>
          )}
        </form>

        <p className="mt-2 text-xs text-muted">
          Agrupado pelo nome digitado nas comandas — nomes escritos de formas diferentes podem
          aparecer separados.
        </p>

        {listaInativas && (
          <CampanhaWhatsApp
            clientes={listaInativas.map((g) => ({
              chave: g.chave,
              nome: g.nome,
              contato: g.contato,
              dias: g.dias,
              ultimaVisita: g.ultimaVisita,
            }))}
          />
        )}

        {!listaInativas && (
          <>
        {/* Mobile: cards */}
        <div className="mt-6 space-y-2 sm:hidden">
          {lista.map((g) => (
            <Link
              key={g.chave}
              href={`/clientes/${chaveCliente(g.nome)}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">{g.nome}</span>
                <span className="shrink-0 font-medium text-accent-2">
                  {g.totalGasto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted">
                {g.visitas} visita{g.visitas > 1 ? "s" : ""} · última em{" "}
                {new Date(g.ultimaVisita + "T00:00:00").toLocaleDateString("pt-BR")}
              </div>
              <div className="mt-0.5 text-sm text-muted">{g.contato || "Sem telefone"}</div>
            </Link>
          ))}
          {lista.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhuma cliente encontrada.
            </div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Telefone</th>
                  <th className="px-4 py-2 font-medium">Visitas</th>
                  <th className="px-4 py-2 font-medium">Última visita</th>
                  <th className="px-4 py-2 font-medium">Total gasto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map((g) => (
                  <tr key={g.chave} className="transition-colors hover:bg-card-hover">
                    <td className="px-4 py-2">
                      <Link href={`/clientes/${chaveCliente(g.nome)}`} className="block">
                        {g.nome}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      <Link href={`/clientes/${chaveCliente(g.nome)}`} className="block">
                        {g.contato || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      <Link href={`/clientes/${chaveCliente(g.nome)}`} className="block">
                        {g.visitas}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      <Link href={`/clientes/${chaveCliente(g.nome)}`} className="block">
                        {new Date(g.ultimaVisita + "T00:00:00").toLocaleDateString("pt-BR")}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium text-accent-2">
                      <Link href={`/clientes/${chaveCliente(g.nome)}`} className="block">
                        {g.totalGasto.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </Link>
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      Nenhuma cliente encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
