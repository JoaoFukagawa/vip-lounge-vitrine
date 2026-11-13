import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { brl, buscarCaixaAberto } from "@/lib/caixa";
import { ReceberForm } from "./ReceberForm";
import type { Comanda } from "@/lib/types";

const FORMA: Record<string, string> = { dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão" };

export default async function ReceberDuplicataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [profile, { data: comanda }, caixa] = await Promise.all([
    getCurrentProfile(),
    supabase.from("comandas").select("*").eq("id", id).maybeSingle() as unknown as Promise<{
      data: Comanda | null;
    }>,
    buscarCaixaAberto(supabase),
  ]);

  if (!profile) redirect("/login");
  if (!comanda) notFound();

  const pagamentos = comanda.pagamentos ?? [];
  const pago = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
  const saldo = Math.round((Number(comanda.total) - pago) * 100) / 100;

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
        <Link href="/duplicatas" className="text-sm text-muted hover:text-accent-2">
          ← Duplicatas
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Receber de {comanda.cliente_nome || "cliente sem nome"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Comanda de {new Date(comanda.data + "T00:00:00").toLocaleDateString("pt-BR")} ·{" "}
          <Link href={`/comandas/${comanda.id}`} className="underline hover:text-accent-2">
            ver comanda
          </Link>
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-xs text-muted">Total</div>
            <div className="mt-1 font-semibold">{brl(Number(comanda.total))}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-xs text-muted">Já pago</div>
            <div className="mt-1 font-semibold">{brl(pago)}</div>
          </div>
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-center">
            <div className="text-xs text-muted">Falta</div>
            <div className="mt-1 font-semibold text-danger">{brl(Math.max(saldo, 0))}</div>
          </div>
        </div>

        {pagamentos.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-sm text-muted">
            {pagamentos.map((p, i) => (
              <li key={i}>
                {FORMA[p.forma] ?? p.forma} {brl(Number(p.valor))}
                {p.recebido_em &&
                  ` · recebido em ${new Date(p.recebido_em).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}`}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          {saldo <= 0.009 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-6 text-center text-muted">
              Esta comanda já está quitada.
            </div>
          ) : !caixa ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              O caixa está fechado. O recebimento entra no caixa do dia —{" "}
              {profile.role === "admin" ? (
                <>
                  <Link href="/caixa" className="font-medium underline">
                    abra o caixa
                  </Link>{" "}
                  primeiro.
                </>
              ) : (
                "peça para a administração abrir o caixa primeiro."
              )}
            </div>
          ) : (
            <ReceberForm comandaId={comanda.id} saldo={saldo} />
          )}
        </div>
      </main>
    </div>
  );
}
