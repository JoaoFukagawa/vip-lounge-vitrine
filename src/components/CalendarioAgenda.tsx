"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AgendamentoAcoes } from "@/components/AgendamentoAcoes";
import { STATUS_LABEL } from "@/lib/agendamento-status";
import type { Profile } from "@/lib/types";

export type Bloco = {
  id: string;
  clienteNome: string;
  servicoNome: string | null;
  horaInicio: string;
  horaFim: string;
  status: string;
  observacoes: string | null;
  profissionalId: string;
  top: number;
  height: number;
};

export type Coluna = {
  profissional: Profile;
  trabalhaHoje: boolean;
  horarioLabel: string | null;
  blocos: Bloco[];
};

const BLOCO_CLASS: Record<string, string> = {
  agendado: "border-accent-2 bg-accent-2/10 text-foreground",
  concluido: "border-emerald-500 bg-emerald-500/10 text-foreground",
  cancelado: "border-danger/60 bg-danger/5 text-muted line-through decoration-danger/50",
  nao_compareceu: "border-muted bg-muted/5 text-muted",
};

const LARGURA_COLUNA = 168;
const LARGURA_EIXO = 52;

function formatarDataLabel(dataISO: string) {
  const d = new Date(dataISO + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

export function CalendarioAgenda({
  data,
  dataAnterior,
  dataSeguinte,
  hoje,
  colunas,
  alturaTotal,
  marcasHora,
  profissionais,
}: {
  data: string;
  dataAnterior: string;
  dataSeguinte: string;
  hoje: string;
  colunas: Coluna[];
  alturaTotal: number;
  marcasHora: { top: number; label: string }[];
  profissionais: Profile[];
}) {
  const router = useRouter();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const blocoSelecionado = selecionadoId
    ? colunas.flatMap((c) => c.blocos).find((b) => b.id === selecionadoId)
    : undefined;
  const colunaSelecionada = blocoSelecionado
    ? colunas.find((c) => c.profissional.id === blocoSelecionado.profissionalId)
    : undefined;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/agendamentos?data=${dataAnterior}`}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
        >
          ← Anterior
        </Link>
        <input
          type="date"
          value={data}
          onChange={(e) => router.push(`/agendamentos?data=${e.target.value}`)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
        <Link
          href={`/agendamentos?data=${dataSeguinte}`}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
        >
          Próximo →
        </Link>
        {data !== hoje && (
          <Link
            href={`/agendamentos?data=${hoje}`}
            className="rounded-lg border border-accent-2/40 px-3 py-1.5 text-sm text-accent-2 transition-colors hover:bg-accent-2/10"
          >
            Hoje
          </Link>
        )}
        <span className="text-sm capitalize text-muted">{formatarDataLabel(data)}</span>
      </div>

      {colunas.length === 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
          Nenhum profissional ativo cadastrado.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
          <div className="flex" style={{ minWidth: LARGURA_EIXO + colunas.length * LARGURA_COLUNA }}>
            {/* Eixo de horas */}
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-border bg-card"
              style={{ width: LARGURA_EIXO }}
            >
              <div className="border-b border-border px-2 py-2 text-xs text-muted">&nbsp;</div>
              <div className="relative" style={{ height: alturaTotal }}>
                {marcasHora.map((m) => (
                  <div
                    key={m.label}
                    className="absolute right-1.5 -translate-y-1/2 text-[11px] text-muted"
                    style={{ top: m.top }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Colunas de profissionais */}
            {colunas.map((coluna) => (
              <div
                key={coluna.profissional.id}
                className="shrink-0 border-r border-border last:border-r-0"
                style={{ width: LARGURA_COLUNA }}
              >
                <div className="truncate border-b border-border px-2 py-2 text-center">
                  <div className="truncate text-sm font-medium text-foreground">
                    {coluna.profissional.nome}
                  </div>
                  <div className="text-[11px] text-muted">
                    {coluna.horarioLabel ?? "Folga"}
                  </div>
                </div>
                <div className="relative" style={{ height: alturaTotal }}>
                  {marcasHora.map((m) => (
                    <div
                      key={m.label}
                      className="absolute inset-x-0 border-t border-border/60"
                      style={{ top: m.top }}
                    />
                  ))}
                  {!coluna.trabalhaHoje && (
                    <div className="absolute inset-0 bg-background/40" />
                  )}
                  {coluna.blocos.map((bloco) => (
                    <button
                      key={bloco.id}
                      type="button"
                      onClick={() => setSelecionadoId(bloco.id)}
                      className={`absolute left-1 right-1 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-opacity hover:opacity-80 ${BLOCO_CLASS[bloco.status] ?? BLOCO_CLASS.agendado}`}
                      style={{ top: bloco.top, height: bloco.height }}
                      title={`${bloco.horaInicio}–${bloco.horaFim} · ${bloco.clienteNome}${bloco.servicoNome ? " · " + bloco.servicoNome : ""}`}
                    >
                      <div className="truncate font-semibold">
                        {bloco.horaInicio}–{bloco.horaFim}
                      </div>
                      <div className="truncate">{bloco.clienteNome}</div>
                      {bloco.servicoNome && bloco.height > 52 && (
                        <div className="truncate opacity-80">{bloco.servicoNome}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Painel de detalhe */}
      {blocoSelecionado && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setSelecionadoId(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-foreground">{blocoSelecionado.clienteNome}</div>
                <div className="mt-0.5 text-sm text-muted">
                  {colunaSelecionada?.profissional.nome} · {blocoSelecionado.horaInicio}–
                  {blocoSelecionado.horaFim}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelecionadoId(null)}
                className="shrink-0 text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {blocoSelecionado.servicoNome && (
              <div className="mt-3 text-sm text-foreground">{blocoSelecionado.servicoNome}</div>
            )}
            {blocoSelecionado.observacoes && (
              <div className="mt-1 text-sm text-muted">{blocoSelecionado.observacoes}</div>
            )}
            <div className="mt-1 text-sm text-muted">
              Status: {STATUS_LABEL[blocoSelecionado.status] ?? blocoSelecionado.status}
            </div>

            <div className="mt-4">
              <AgendamentoAcoes
                agendamentoId={blocoSelecionado.id}
                status={blocoSelecionado.status}
                profissionalAtualId={blocoSelecionado.profissionalId}
                profissionais={profissionais}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
