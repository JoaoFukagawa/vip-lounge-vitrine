"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  abrirCaixa,
  estornarMovimento,
  fecharCaixa,
  lancarMovimento,
  lancarSaida,
} from "./actions";
import { brl } from "@/lib/caixa";

const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2";
const LABEL = "block text-sm font-medium text-foreground";
const BOTAO =
  "brand-gradient glow-accent rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60";

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-full">
      {texto}
    </p>
  );
}

// Limpa o formulário quando a ação termina sem erro.
function useLimparAoSalvar(pending: boolean, erro: string | null) {
  const ref = useRef<HTMLFormElement>(null);
  const antes = useRef(pending);
  useEffect(() => {
    if (antes.current && !pending && !erro) ref.current?.reset();
    antes.current = pending;
  }, [pending, erro]);
  return ref;
}

export function AbrirCaixaForm({ fundoEsperado }: { fundoEsperado: number | null }) {
  const [erro, action, pending] = useActionState(abrirCaixa, null);
  const [fundo, setFundo] = useState(fundoEsperado !== null ? String(fundoEsperado) : "");
  const contado = parseFloat(fundo.replace(",", "."));
  const diferente =
    fundoEsperado !== null && !isNaN(contado) && Math.abs(contado - fundoEsperado) >= 0.005;

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
      <div>
        <label className={LABEL}>Dinheiro na gaveta agora (R$)</label>
        <input
          name="fundo"
          inputMode="decimal"
          required
          value={fundo}
          onChange={(e) => setFundo(e.target.value)}
          placeholder="0,00"
          className={INPUT}
        />
        <p className="mt-1 text-xs text-muted">
          {fundoEsperado !== null
            ? `No último fechamento ficaram ${brl(fundoEsperado)} de troco na gaveta.`
            : "Primeiro caixa: conte o troco que está na gaveta."}
        </p>
      </div>
      {diferente && (
        <div>
          <label className={LABEL}>Por que está diferente?</label>
          <input name="justificativa" required className={INPUT} placeholder="Obrigatório" />
        </div>
      )}
      <Erro texto={erro} />
      <div className="sm:col-span-full">
        <button type="submit" disabled={pending} className={BOTAO}>
          {pending ? "Abrindo..." : "Abrir caixa"}
        </button>
      </div>
    </form>
  );
}

export function MovimentoForm() {
  const [erro, action, pending] = useActionState(lancarMovimento, null);
  const ref = useLimparAoSalvar(pending, erro);
  const [tipo, setTipo] = useState("suprimento");

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={LABEL}>Tipo</label>
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className={INPUT}
        >
          <option value="suprimento">Suprimento (colocar troco na gaveta)</option>
          <option value="sangria">Sangria (tirar pro cofre/banco)</option>
          <option value="ajuste">Ajuste</option>
        </select>
      </div>
      {tipo === "ajuste" && (
        <div>
          <label className={LABEL}>Sentido</label>
          <select name="sentido" required className={INPUT} defaultValue="">
            <option value="" disabled>
              Selecione...
            </option>
            <option value="entrada">Entrada na gaveta</option>
            <option value="saida">Saída da gaveta</option>
          </select>
        </div>
      )}
      <div>
        <label className={LABEL}>Valor (R$)</label>
        <input name="valor" inputMode="decimal" required placeholder="0,00" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Descrição</label>
        <input name="descricao" required placeholder='Ex: "Troco do banco"' className={INPUT} />
      </div>
      <Erro texto={erro} />
      <div className="sm:col-span-full">
        <button type="submit" disabled={pending} className={BOTAO}>
          {pending ? "Lançando..." : "Lançar"}
        </button>
      </div>
    </form>
  );
}

export function SaidaForm({
  categorias,
}: {
  categorias: { id: string; nome: string; grupo: string }[];
}) {
  const [erro, action, pending] = useActionState(lancarSaida, null);
  const ref = useLimparAoSalvar(pending, erro);
  const grupos = Array.from(new Set(categorias.map((c) => c.grupo)));

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-full">
        <label className={LABEL}>O que foi pago</label>
        <input name="descricao" required placeholder='Ex: "Refrigerante"' className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Valor (R$)</label>
        <input name="valor" inputMode="decimal" required placeholder="0,00" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Categoria</label>
        <select name="categoria_id" required defaultValue="" className={INPUT}>
          <option value="" disabled>
            Selecione...
          </option>
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {categorias
                .filter((c) => c.grupo === g)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <Erro texto={erro} />
      <div className="sm:col-span-full">
        <button type="submit" disabled={pending} className={BOTAO}>
          {pending ? "Lançando..." : "Tirar do caixa"}
        </button>
      </div>
    </form>
  );
}

export function FecharCaixaForm() {
  const [erro, action, pending] = useActionState(fecharCaixa, null);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Fechar o caixa? Depois de fechado, as comandas e saídas do dia não podem mais ser alteradas.")) {
          e.preventDefault();
        }
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div>
        <label className={LABEL}>Dinheiro contado na gaveta (R$)</label>
        <input name="contado_dinheiro" inputMode="decimal" required placeholder="0,00" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Quanto fica de troco pra amanhã (R$)</label>
        <input name="fundo_deixado" inputMode="decimal" required placeholder="0,00" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Total no cartão (relatório da maquininha)</label>
        <input name="informado_cartao" inputMode="decimal" required placeholder="0,00" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Total no Pix (extrato)</label>
        <input name="informado_pix" inputMode="decimal" required placeholder="0,00" className={INPUT} />
      </div>
      <div className="sm:col-span-full">
        <label className={LABEL}>Observação</label>
        <input name="observacao" placeholder="Opcional" className={INPUT} />
      </div>
      <Erro texto={erro} />
      <div className="sm:col-span-full">
        <button type="submit" disabled={pending} className={BOTAO}>
          {pending ? "Fechando..." : "Fechar caixa"}
        </button>
      </div>
    </form>
  );
}

export function EstornarButton({ movimentoId }: { movimentoId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const motivo = prompt("Motivo do estorno:");
        if (!motivo?.trim()) return;
        startTransition(async () => {
          const r = await estornarMovimento(movimentoId, motivo.trim());
          if (r.error) alert(r.error);
        });
      }}
      className="text-xs text-danger/80 transition-colors hover:text-danger disabled:opacity-60"
    >
      {pending ? "Estornando..." : "Estornar"}
    </button>
  );
}
