import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { normalizarNome } from "@/lib/clientes";
import { podeVerClientes } from "@/lib/permissoes";

type ItemRow = { servico: string; valor: number; profissional: { nome: string } | null };
type ComandaRow = {
  id: string;
  data: string;
  cliente_nome: string | null;
  cliente_contato: string | null;
  total: number;
  comanda_itens: ItemRow[];
};

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ nome: string }>;
}) {
  const { nome: nomeParam } = await params;
  const chaveBuscada = decodeURIComponent(nomeParam);

  const supabase = await createClient();
  const [profile, { data: comandas }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("comandas")
      .select("id, data, cliente_nome, cliente_contato, total, comanda_itens(servico, valor, profissional:profissional_id(nome))")
      .order("data", { ascending: false }) as unknown as Promise<{ data: ComandaRow[] | null }>,
  ]);

  if (!profile) redirect("/login");
  if (!podeVerClientes(profile)) redirect("/");

  const visitas = (comandas ?? []).filter(
    (c) => c.cliente_nome && normalizarNome(c.cliente_nome) === chaveBuscada
  );

  if (visitas.length === 0) notFound();

  const nome = visitas[0].cliente_nome ?? "—";
  const contato = visitas.find((v) => v.cliente_contato)?.cliente_contato ?? null;
  const totalGasto = visitas.reduce((soma, v) => soma + v.total, 0);
  const ticketMedio = totalGasto / visitas.length;
  const primeiraVisita = visitas[visitas.length - 1].data;
  const ultimaVisita = visitas[0].data;

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <Link href="/clientes" className="text-sm text-muted hover:text-accent-2">
          ← Clientes
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{nome}</h1>
        {contato && <p className="mt-1 text-sm text-muted">{contato}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Visitas</div>
            <div className="mt-1 font-semibold text-foreground">{visitas.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Total gasto</div>
            <div className="mt-1 font-semibold text-accent-2">
              {totalGasto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Ticket médio</div>
            <div className="mt-1 font-semibold text-foreground">
              {ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center sm:p-4">
            <div className="text-xs text-muted sm:text-sm">Cliente desde</div>
            <div className="mt-1 font-semibold text-foreground">
              {new Date(primeiraVisita + "T00:00:00").toLocaleDateString("pt-BR")}
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted">
          Última visita: {new Date(ultimaVisita + "T00:00:00").toLocaleDateString("pt-BR")}
        </p>

        <h2 className="mt-6 text-sm font-medium text-foreground">Histórico de visitas</h2>
        <div className="mt-2 space-y-2">
          {visitas.map((v) => (
            <Link
              key={v.id}
              href={`/comandas/${v.id}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                </span>
                <span className="font-medium text-accent-2">
                  {v.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {v.comanda_itens.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm text-muted">
                    <span>
                      {item.servico}
                      {item.profissional?.nome && ` · ${item.profissional.nome}`}
                    </span>
                    <span>
                      {item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                ))}
                {v.comanda_itens.length === 0 && (
                  <div className="text-sm text-muted">Nenhum serviço lançado.</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
