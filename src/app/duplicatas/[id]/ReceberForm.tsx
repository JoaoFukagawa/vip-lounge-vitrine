"use client";

import { useActionState, useState } from "react";
import { receberPagamento } from "@/app/caixa/actions";

const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2";

const numero = (t: string) => {
  const v = parseFloat(t.replace(",", "."));
  return isNaN(v) ? 0 : v;
};

export function ReceberForm({ comandaId, saldo }: { comandaId: string; saldo: number }) {
  const [erro, action, pending] = useActionState(receberPagamento.bind(null, comandaId), null);
  const [forma, setForma] = useState("dinheiro");
  const [tipoCartao, setTipoCartao] = useState("");
  const [valor, setValor] = useState(saldo.toFixed(2));
  const [recebido, setRecebido] = useState("");
  const troco = numero(recebido) - numero(valor);

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
      <div>
        <label className="block text-sm font-medium text-foreground">Forma</label>
        <select name="forma" value={forma} onChange={(e) => setForma(e.target.value)} className={INPUT}>
          <option value="dinheiro">Dinheiro</option>
          <option value="pix">PIX</option>
          <option value="cartao">Cartão</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Valor (R$)</label>
        <input
          name="valor"
          inputMode="decimal"
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className={INPUT}
        />
      </div>
      {forma === "dinheiro" && (
        <div>
          <label className="block text-sm font-medium text-foreground">Recebido (pra calcular troco)</label>
          <input
            name="valor_recebido"
            inputMode="decimal"
            value={recebido}
            onChange={(e) => setRecebido(e.target.value)}
            placeholder="Opcional"
            className={INPUT}
          />
          {troco > 0.004 && (
            <p className="mt-1 text-sm font-medium text-accent-2">
              Troco: {troco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          )}
        </div>
      )}
      {forma === "cartao" && (
        <>
          <div>
            <label className="block text-sm font-medium text-foreground">Débito ou crédito</label>
            <select
              name="tipo_cartao"
              required
              value={tipoCartao}
              onChange={(e) => setTipoCartao(e.target.value)}
              className={INPUT}
            >
              <option value="" disabled>
                Selecione...
              </option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
            </select>
          </div>
          {tipoCartao === "credito" && (
            <div>
              <label className="block text-sm font-medium text-foreground">Parcelas</label>
              <input name="parcelas" type="number" min={1} defaultValue={1} className={INPUT} />
            </div>
          )}
        </>
      )}
      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-full">
          {erro}
        </p>
      )}
      <div className="sm:col-span-full">
        <button
          type="submit"
          disabled={pending}
          className="brand-gradient glow-accent rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Registrando..." : "Registrar recebimento"}
        </button>
      </div>
    </form>
  );
}
