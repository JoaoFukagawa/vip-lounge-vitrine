"use client";

import { useEffect, useRef, useState } from "react";
import { buscarClientes, type ClienteResultado } from "@/app/clientes/actions";

export function ClienteAutocomplete({
  nome,
  onNomeChange,
  onSelecionarCliente,
  onLimparCliente,
  required,
  clienteVinculado,
}: {
  nome: string;
  onNomeChange: (nome: string) => void;
  onSelecionarCliente: (cliente: ClienteResultado) => void;
  onLimparCliente?: () => void;
  required?: boolean;
  /** true quando o nome atual já está vinculado a um cadastro (esconde as sugestões) */
  clienteVinculado?: boolean;
}) {
  const [sugestoes, setSugestoes] = useState<ClienteResultado[]>([]);
  const [aberto, setAberto] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Já vinculada a um cadastro, ou nome curto demais: não busca de novo.
    if (clienteVinculado || nome.trim().length < 2) return;

    timeoutRef.current = setTimeout(async () => {
      const resultado = await buscarClientes(nome);
      setSugestoes(resultado);
      setAberto(resultado.length > 0);
    }, 300);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [nome, clienteVinculado]);

  const mostrarSugestoes =
    aberto && !clienteVinculado && nome.trim().length >= 2 && sugestoes.length > 0;

  return (
    <div className="relative">
      <input
        value={nome}
        onChange={(e) => {
          onNomeChange(e.target.value);
          onLimparCliente?.();
        }}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        required={required}
        autoComplete="off"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
      />
      {clienteVinculado && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent-2">
          cadastrada ✓
        </span>
      )}
      {mostrarSugestoes && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {sugestoes.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelecionarCliente(c);
                  setAberto(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-card-hover"
              >
                <div className="font-medium">{c.nome}</div>
                {c.contato && <div className="text-xs text-muted">{c.contato}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
