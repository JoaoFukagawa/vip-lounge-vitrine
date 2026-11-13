"use client";

import { useState, useTransition } from "react";
import {
  alternarCategoriaAtiva,
  excluirCategoria,
  renomearCategoria,
} from "./actions";
import type { DespesaCategoria } from "@/lib/types";

export function CategoriaRow({ categoria }: { categoria: DespesaCategoria }) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(categoria.nome);
  const [erro, setErro] = useState<string | null>(null);

  const protegida = !!categoria.sistema_chave;

  const salvar = () => {
    const limpo = nome.trim();
    if (!limpo || limpo === categoria.nome) {
      setEditando(false);
      setNome(categoria.nome);
      return;
    }
    startTransition(() => {
      renomearCategoria(categoria.id, limpo);
      setEditando(false);
    });
  };

  const alternar = () => {
    startTransition(() => {
      alternarCategoriaAtiva(categoria.id, !categoria.ativa);
    });
  };

  const excluir = () => {
    if (!confirm(`Excluir a categoria "${categoria.nome}"?`)) return;
    setErro(null);
    startTransition(async () => {
      const r = await excluirCategoria(categoria.id);
      if (!r.ok && r.erro) setErro(r.erro);
    });
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 ${
        categoria.ativa ? "" : "opacity-60"
      }`}
    >
      {editando ? (
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") {
              setNome(categoria.nome);
              setEditando(false);
            }
          }}
          className="flex-1 rounded border border-accent-2/50 bg-card px-2 py-1 text-sm text-foreground outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="flex-1 text-left text-sm text-foreground"
        >
          {categoria.nome}
          {protegida && (
            <span className="ml-2 rounded-full bg-accent-2/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent-2">
              usada pelo sistema
            </span>
          )}
          {!categoria.ativa && (
            <span className="ml-2 rounded-full bg-muted/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              inativa
            </span>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={alternar}
        disabled={pending}
        className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent-2 hover:text-accent-2 disabled:opacity-60"
      >
        {categoria.ativa ? "Desativar" : "Ativar"}
      </button>

      {!protegida && (
        <button
          type="button"
          onClick={excluir}
          disabled={pending}
          className="rounded-md border border-danger/40 bg-danger/5 px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
        >
          Excluir
        </button>
      )}

      {erro && <p className="w-full text-xs text-danger">{erro}</p>}
    </div>
  );
}
