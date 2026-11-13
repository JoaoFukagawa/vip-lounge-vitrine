import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { buscarCaixaAberto } from "@/lib/caixa";
import { Header } from "@/components/Header";
import { ExcluirComandaButton } from "@/components/ExcluirComandaButton";
import type { Comanda } from "@/lib/types";

const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  pix: "PIX",
};

function formatarPagamentos(pagamentos: Comanda["pagamentos"]) {
  if (!pagamentos || pagamentos.length === 0) return "—";
  return Array.from(new Set(pagamentos.map((p) => FORMA_PAGAMENTO_LABEL[p.forma] ?? p.forma))).join(
    " + "
  );
}

type ComandaLista = Comanda & { caixa: { status: string } | null };

// Comanda de caixa já fechado não pode ser excluída (o banco recusa).
function excluivel(comanda: ComandaLista) {
  return !comanda.caixa || comanda.caixa.status === "aberto";
}

function CaixaFechadoSelo() {
  return (
    <span className="text-xs text-muted" title="Comanda de um caixa já fechado: não pode ser excluída">
      caixa fechado
    </span>
  );
}

function ehPendente(comanda: Comanda) {
  const pago = (comanda.pagamentos ?? []).reduce((soma, p) => soma + p.valor, 0);
  return comanda.total - pago > 0.01;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: filtroData } = await searchParams;

  const supabase = await createClient();
  let query = supabase
    .from("comandas")
    .select("*, caixa:caixa_sessao_id(status)")
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtroData) query = query.eq("data", filtroData);

  const [profile, { data: comandas }, caixa] = await Promise.all([
    getCurrentProfile(),
    query as unknown as Promise<{ data: ComandaLista[] | null }>,
    buscarCaixaAberto(supabase),
  ]);

  if (!profile) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        {!caixa &&
          (profile.role === "admin" ? (
            <Link
              href="/caixa"
              className="mb-4 block rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger transition-colors hover:bg-danger/15"
            >
              O caixa está fechado — comandas novas só entram com o caixa aberto.{" "}
              <span className="font-medium underline">Abrir caixa</span>
            </Link>
          ) : (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              O caixa está fechado — peça para a administração abrir o caixa antes de lançar
              comandas.
            </div>
          ))}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Comandas</h1>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form className="flex items-center gap-2">
              <input
                type="date"
                name="data"
                defaultValue={filtroData ?? ""}
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2 sm:flex-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
              >
                Filtrar
              </button>
              {filtroData && (
                <Link
                  href="/"
                  className="shrink-0 text-sm text-muted transition-colors hover:text-accent-2"
                >
                  Limpar
                </Link>
              )}
            </form>
            <Link
              href="/comandas/nova"
              className="brand-gradient glow-accent rounded-lg px-4 py-2 text-center text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              + Nova comanda
            </Link>
          </div>
        </div>

        {/* Mobile: cards */}
        <div className="mt-6 space-y-2 sm:hidden">
          {comandas?.map((comanda) => (
            <div
              key={comanda.id}
              className="relative rounded-xl border border-border bg-card p-4"
            >
              <Link href={`/comandas/${comanda.id}`} className="block pr-16">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">
                    {comanda.cliente_nome || "—"}
                  </span>
                  <span className="shrink-0 font-medium text-accent-2">
                    {comanda.total.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                  {new Date(comanda.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  {" · "}
                  {formatarPagamentos(comanda.pagamentos)}
                  {ehPendente(comanda) && (
                    <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                      Pendente
                    </span>
                  )}
                </div>
              </Link>
              <div className="absolute right-4 top-4">
                {excluivel(comanda) ? (
                  <ExcluirComandaButton comandaId={comanda.id} />
                ) : (
                  <CaixaFechadoSelo />
                )}
              </div>
            </div>
          ))}
          {comandas?.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhuma comanda encontrada.
            </div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Pagamento</th>
                  <th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comandas?.map((comanda) => (
                  <tr
                    key={comanda.id}
                    className="transition-colors hover:bg-card-hover"
                  >
                    <td className="px-4 py-2">
                      <Link href={`/comandas/${comanda.id}`} className="block">
                        {new Date(comanda.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/comandas/${comanda.id}`} className="block">
                        {comanda.cliente_nome || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/comandas/${comanda.id}`} className="flex items-center gap-2">
                        {formatarPagamentos(comanda.pagamentos)}
                        {ehPendente(comanda) && (
                          <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                            Pendente
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium text-accent-2">
                      <Link href={`/comandas/${comanda.id}`} className="block">
                        {comanda.total.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {excluivel(comanda) ? (
                        <ExcluirComandaButton comandaId={comanda.id} />
                      ) : (
                        <CaixaFechadoSelo />
                      )}
                    </td>
                  </tr>
                ))}
                {comandas?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      Nenhuma comanda encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
