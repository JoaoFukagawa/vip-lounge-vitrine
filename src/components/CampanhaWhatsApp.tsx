"use client";

import { useState } from "react";
import { telefoneWhatsApp } from "@/lib/clientes";

export type ClienteInativo = {
  chave: string;
  nome: string;
  contato: string | null;
  dias: number;
  ultimaVisita: string;
};

const MENSAGEM_PADRAO =
  "Oi {nome}! Faz um tempinho que você não aparece por aqui 💛 Que tal marcar um horário? Estamos com saudade!";

export function CampanhaWhatsApp({ clientes }: { clientes: ClienteInativo[] }) {
  const [mensagem, setMensagem] = useState(MENSAGEM_PADRAO);

  const comTelefone = clientes.filter((c) => telefoneWhatsApp(c.contato));

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="block text-sm font-medium text-foreground">
          Mensagem (use <span className="text-accent-2">{"{nome}"}</span> pra
          personalizar)
        </label>
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
        />
        <p className="mt-2 text-xs text-muted">
          {comTelefone.length} de {clientes.length} têm telefone cadastrado — clique em
          &ldquo;WhatsApp&rdquo; pra abrir a conversa já com a mensagem escrita, só falta
          apertar enviar.
        </p>
      </div>

      <div className="space-y-2">
        {clientes.map((c) => {
          const numero = telefoneWhatsApp(c.contato);
          const primeiroNome = c.nome.trim().split(/\s+/)[0];
          const texto = mensagem.replace(/\{nome\}/g, primeiroNome);
          const link = numero
            ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
            : null;

          return (
            <div
              key={c.chave}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-medium text-foreground">{c.nome}</div>
                <div className="text-sm text-muted">
                  {c.dias} dias sem visita · última em{" "}
                  {new Date(c.ultimaVisita + "T00:00:00").toLocaleDateString("pt-BR")}
                </div>
              </div>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  WhatsApp
                </a>
              ) : (
                <span className="shrink-0 rounded-lg border border-border px-4 py-2 text-center text-sm text-muted">
                  Sem telefone
                </span>
              )}
            </div>
          );
        })}
        {clientes.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-muted">
            Nenhuma cliente nesse intervalo.
          </div>
        )}
      </div>
    </div>
  );
}
