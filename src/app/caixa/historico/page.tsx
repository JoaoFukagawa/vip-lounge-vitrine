import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { brl } from "@/lib/caixa";
import type { CaixaApuracao, CaixaSessao } from "@/lib/types";

type Linha = CaixaSessao & { apuracao: CaixaApuracao | CaixaApuracao[] | null };

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  aberto: { rotulo: "Aberto", classe: "bg-accent-2/10 text-accent-2" },
  fechado: { rotulo: "A conferir", classe: "bg-danger/10 text-danger" },
  conferido: { rotulo: "Conferido", classe: "bg-muted/20 text-muted" },
};

function Diferenca({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-muted">—</span>;
  if (Math.abs(valor) < 0.005) return <span className="text-muted">OK</span>;
  return (
    <span className="font-medium text-danger">
      {valor > 0 ? "sobrou " : "faltou "}
      {brl(Math.abs(valor))}
    </span>
  );
}

export default async function HistoricoCaixaPage() {
  const supabase = await createClient();
  const [profile, { data: sessoes }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("caixa_sessoes")
      .select("*, apuracao:caixa_apuracoes(*)")
      .order("aberto_em", { ascending: false })
      .limit(90) as unknown as Promise<{ data: Linha[] | null }>,
  ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  const linhas = (sessoes ?? []).map((s) => ({
    ...s,
    ap: Array.isArray(s.apuracao) ? (s.apuracao[0] ?? null) : s.apuracao,
  }));

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <Link href="/caixa" className="text-sm text-muted hover:text-accent-2">
          ← Caixa
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Histórico de caixas</h1>
        <p className="mt-1 text-sm text-muted">
          Caixas &ldquo;a conferir&rdquo; esperam sua revisão. Clique para ver o detalhe.
        </p>

        <div className="mt-6 space-y-2">
          {linhas.map((s) => (
            <Link
              key={s.id}
              href={`/caixa/${s.id}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {new Date(s.data_operacional + "T00:00:00").toLocaleDateString("pt-BR")}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[s.status].classe}`}>
                  {STATUS[s.status].rotulo}
                </span>
              </div>
              {s.ap ? (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  <span>
                    Dinheiro: <Diferenca valor={Number(s.ap.diferenca_dinheiro)} />
                  </span>
                  <span>
                    Cartão: <Diferenca valor={Number(s.ap.diferenca_cartao)} />
                  </span>
                  <span>
                    Pix: <Diferenca valor={Number(s.ap.diferenca_pix)} />
                  </span>
                  {s.retirada_final !== null && (
                    <span>Retirada: {brl(Number(s.retirada_final))}</span>
                  )}
                </div>
              ) : (
                <div className="mt-1.5 text-sm text-muted">Ainda aberto.</div>
              )}
            </Link>
          ))}
          {linhas.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
              Nenhum caixa ainda.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
