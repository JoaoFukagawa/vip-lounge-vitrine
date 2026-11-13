import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { brl } from "@/lib/caixa";
import { ConferenciaAcoes } from "./ConferenciaAcoes";
import type { CaixaApuracao, CaixaMovimento, CaixaSessao } from "@/lib/types";

type Evento = { id: string; evento: string; motivo: string | null; feito_por: string; created_at: string };

const quando = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      })
    : "—";

function LinhaComparacao({
  rotulo,
  esperado,
  informado,
}: {
  rotulo: string;
  esperado: number;
  informado: number | null;
}) {
  const dif = informado === null ? null : informado - esperado;
  return (
    <tr>
      <td className="px-4 py-2">{rotulo}</td>
      <td className="px-4 py-2 text-muted">{brl(esperado)}</td>
      <td className="px-4 py-2">{informado === null ? "—" : brl(informado)}</td>
      <td className={`px-4 py-2 font-medium ${dif !== null && Math.abs(dif) >= 0.005 ? "text-danger" : "text-muted"}`}>
        {dif === null ? "—" : Math.abs(dif) < 0.005 ? "OK" : `${dif > 0 ? "+" : "−"}${brl(Math.abs(dif))}`}
      </td>
    </tr>
  );
}

export default async function CaixaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [profile, { data: sessao }, { data: apuracao }, { data: movimentos }, { data: eventos }, { data: perfis }] =
    await Promise.all([
      getCurrentProfile(),
      supabase.from("caixa_sessoes").select("*").eq("id", id).maybeSingle() as unknown as Promise<{
        data: CaixaSessao | null;
      }>,
      supabase.from("caixa_apuracoes").select("*").eq("sessao_id", id).maybeSingle() as unknown as Promise<{
        data: CaixaApuracao | null;
      }>,
      supabase
        .from("caixa_movimentos")
        .select("*")
        .eq("sessao_id", id)
        .order("created_at") as unknown as Promise<{ data: CaixaMovimento[] | null }>,
      supabase
        .from("caixa_eventos")
        .select("id, evento, motivo, feito_por, created_at")
        .eq("sessao_id", id)
        .order("created_at") as unknown as Promise<{ data: Evento[] | null }>,
      supabase.from("profiles").select("id, nome") as unknown as Promise<{
        data: { id: string; nome: string }[] | null;
      }>,
    ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");
  if (!sessao) notFound();
  if (sessao.status === "aberto") redirect("/caixa");

  const nome = new Map((perfis ?? []).map((p) => [p.id, p.nome]));
  const temDiferenca =
    !!apuracao &&
    (Math.abs(Number(apuracao.diferenca_dinheiro)) >= 0.005 ||
      Math.abs(Number(apuracao.diferenca_cartao)) >= 0.005 ||
      Math.abs(Number(apuracao.diferenca_pix)) >= 0.005 ||
      Math.abs(Number(sessao.fundo_contado) - Number(sessao.fundo_esperado)) >= 0.005);

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <Link href="/caixa/historico" className="text-sm text-muted hover:text-accent-2">
          ← Histórico de caixas
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Caixa de {new Date(sessao.data_operacional + "T00:00:00").toLocaleDateString("pt-BR")}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Aberto em {quando(sessao.aberto_em)} por {nome.get(sessao.aberto_por) ?? "—"} · fechado em{" "}
          {quando(sessao.fechado_em)} por {sessao.fechado_por ? nome.get(sessao.fechado_por) ?? "—" : "—"}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-xs text-muted">Troco na abertura</div>
            <div className="mt-1 font-semibold">{brl(Number(sessao.fundo_contado))}</div>
            {Math.abs(Number(sessao.fundo_contado) - Number(sessao.fundo_esperado)) >= 0.005 && (
              <div className="mt-0.5 text-xs text-danger">esperado {brl(Number(sessao.fundo_esperado))}</div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-xs text-muted">Ficou pra amanhã</div>
            <div className="mt-1 font-semibold">{brl(Number(sessao.fundo_deixado ?? 0))}</div>
          </div>
          <div className="rounded-xl border border-accent-2/30 bg-accent-2/5 p-3 text-center">
            <div className="text-xs text-muted">Retirada final</div>
            <div className="mt-1 font-semibold text-accent-2">{brl(Number(sessao.retirada_final ?? 0))}</div>
          </div>
        </div>

        {apuracao && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-background text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium"></th>
                  <th className="px-4 py-2 font-medium">Esperado</th>
                  <th className="px-4 py-2 font-medium">Informado</th>
                  <th className="px-4 py-2 font-medium">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <LinhaComparacao
                  rotulo="Dinheiro"
                  esperado={Number(apuracao.esperado_dinheiro)}
                  informado={sessao.contado_dinheiro === null ? null : Number(sessao.contado_dinheiro)}
                />
                <LinhaComparacao
                  rotulo="Cartão"
                  esperado={Number(apuracao.esperado_cartao)}
                  informado={sessao.informado_cartao === null ? null : Number(sessao.informado_cartao)}
                />
                <LinhaComparacao
                  rotulo="Pix"
                  esperado={Number(apuracao.esperado_pix)}
                  informado={sessao.informado_pix === null ? null : Number(sessao.informado_pix)}
                />
              </tbody>
            </table>
          </div>
        )}

        {(sessao.justificativa_abertura || sessao.observacao_fechamento || sessao.observacao_conferencia) && (
          <div className="mt-4 space-y-1 text-sm text-muted">
            {sessao.justificativa_abertura && <p>Abertura: {sessao.justificativa_abertura}</p>}
            {sessao.observacao_fechamento && <p>Fechamento: {sessao.observacao_fechamento}</p>}
            {sessao.observacao_conferencia && <p>Conferência: {sessao.observacao_conferencia}</p>}
          </div>
        )}

        {(movimentos ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-foreground">Suprimentos, sangrias e ajustes</h2>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {(movimentos ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>
                    {m.tipo} · {m.descricao}
                  </span>
                  <span className={m.sentido === "entrada" ? "text-accent-2" : "text-danger/80"}>
                    {m.sentido === "entrada" ? "+" : "−"}
                    {brl(Number(m.valor))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-medium text-foreground">Registro</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {(eventos ?? []).map((e) => (
              <li key={e.id}>
                {quando(e.created_at)} — {e.evento} por {nome.get(e.feito_por) ?? "—"}
                {e.motivo ? ` (${e.motivo})` : ""}
              </li>
            ))}
          </ul>
        </section>

        {sessao.status === "fechado" && (
          <div className="mt-6">
            <ConferenciaAcoes sessaoId={sessao.id} temDiferenca={temDiferenca} />
          </div>
        )}
      </main>
    </div>
  );
}
