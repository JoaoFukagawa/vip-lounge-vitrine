import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import type { Pagamento } from "@/lib/types";

type ComandaRow = {
  id: string;
  data: string;
  cliente_nome: string | null;
  cliente_contato: string | null;
  total: number;
  pagamentos: Pagamento[];
};

type Duplicata = ComandaRow & { pago: number; saldo: number };

export default async function DuplicatasPage() {
  const supabase = await createClient();
  const [profile, { data: comandas }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("comandas")
      .select("id, data, cliente_nome, cliente_contato, total, pagamentos")
      .order("data", { ascending: true }) as unknown as Promise<{ data: ComandaRow[] | null }>,
  ]);

  if (!profile) redirect("/login");

  const duplicatas: Duplicata[] = (comandas ?? [])
    .map((c) => {
      const pago = (c.pagamentos ?? []).reduce((soma, p) => soma + p.valor, 0);
      return { ...c, pago, saldo: c.total - pago };
    })
    .filter((c) => c.saldo > 0.01);

  const totalDevido = duplicatas.reduce((soma, d) => soma + d.saldo, 0);

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Duplicatas</h1>
            <p className="mt-1 text-sm text-muted">
              Comandas com pagamento incompleto — clique numa pra registrar o valor que
              faltou.
            </p>
          </div>
          {duplicatas.length > 0 && (
            <div className="shrink-0 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-right">
              <div className="text-xs text-muted">Total em aberto</div>
              <div className="font-semibold text-danger">
                {totalDevido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
          )}
        </div>

        {/* Mobile: cards */}
        <div className="mt-6 space-y-2 sm:hidden">
          {duplicatas.map((d) => (
            <Link
              key={d.id}
              href={`/duplicatas/${d.id}`}
              className="block rounded-xl border border-danger/20 bg-card p-4 transition-colors hover:bg-card-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">
                  {d.cliente_nome || "—"}
                </span>
                <span className="shrink-0 font-medium text-danger">
                  {d.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted">
                {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR")} · pago{" "}
                {d.pago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de{" "}
                {d.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                {d.cliente_contato && ` · ${d.cliente_contato}`}
              </div>
            </Link>
          ))}
          {duplicatas.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhuma duplicata em aberto. 🎉
            </div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Pago</th>
                  <th className="px-4 py-2 font-medium">Saldo devedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {duplicatas.map((d) => (
                  <tr key={d.id} className="transition-colors hover:bg-card-hover">
                    <td className="px-4 py-2">
                      <Link href={`/duplicatas/${d.id}`} className="block">
                        {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/duplicatas/${d.id}`} className="block">
                        {d.cliente_nome || "—"}
                        {d.cliente_contato && (
                          <span className="text-muted"> · {d.cliente_contato}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      <Link href={`/duplicatas/${d.id}`} className="block">
                        {d.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">
                      <Link href={`/duplicatas/${d.id}`} className="block">
                        {d.pago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium text-danger">
                      <Link href={`/duplicatas/${d.id}`} className="block">
                        {d.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </Link>
                    </td>
                  </tr>
                ))}
                {duplicatas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      Nenhuma duplicata em aberto. 🎉
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
