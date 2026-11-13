"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { salvarComanda } from "@/app/comandas/actions";
import { criarCliente } from "@/app/clientes/actions";
import { ClienteAutocomplete } from "@/components/ClienteAutocomplete";
import { hojeSP } from "@/lib/data";
import type { FormaPagamento, Pagamento, Profile, Servico, TipoCartao } from "@/lib/types";

type Linha = {
  key: string;
  servico: string;
  editavelNome: boolean;
  profissionalId: string;
  valor: string;
};

export type ComandaFormInicial = {
  data: string;
  clienteNome: string;
  clienteContato: string;
  clienteId?: string | null;
  pagamentos: Pagamento[];
  itens: { servico: string; profissionalId: string | null; valor: number }[];
};

type PagamentoForm = {
  ativo: boolean;
  valor: string;
  parcelas: string;
  tipoCartao: TipoCartao | "";
  recebido: string;
};

const numero = (texto: string) => {
  const v = parseFloat(texto.replace(",", "."));
  return isNaN(v) ? 0 : v;
};

const FORMAS: [FormaPagamento, string][] = [
  ["cartao", "Cartão"],
  ["dinheiro", "Dinheiro"],
  ["pix", "PIX"],
];

const QTD_LINHAS_EXTRAS = 3;

function pagamentosIniciais(pagamentos?: Pagamento[]): Record<FormaPagamento, PagamentoForm> {
  const base: Record<FormaPagamento, PagamentoForm> = {
    cartao: { ativo: false, valor: "", parcelas: "", tipoCartao: "", recebido: "" },
    dinheiro: { ativo: false, valor: "", parcelas: "", tipoCartao: "", recebido: "" },
    pix: { ativo: false, valor: "", parcelas: "", tipoCartao: "", recebido: "" },
  };
  // Uma comanda pode ter mais de um pagamento da mesma forma (ex: parte paga
  // depois, pela tela de Duplicatas) — soma tudo na linha daquela forma.
  for (const p of pagamentos ?? []) {
    const jaTinha = base[p.forma].ativo;
    base[p.forma] = {
      ativo: true,
      valor: String(Math.round((numero(base[p.forma].valor) + p.valor) * 100) / 100),
      parcelas: p.parcelas ? String(p.parcelas) : base[p.forma].parcelas,
      tipoCartao: p.tipo_cartao ?? base[p.forma].tipoCartao,
      recebido: !jaTinha && p.valor_recebido ? String(p.valor_recebido) : "",
    };
  }
  return base;
}

export function ComandaForm({
  profissionais,
  servicos,
  comandaId,
  agendamentoId,
  inicial,
  travada = false,
  semCaixaAberto = false,
  podeAbrirCaixa = false,
}: {
  profissionais: Profile[];
  servicos: Servico[];
  comandaId?: string;
  agendamentoId?: string;
  inicial?: ComandaFormInicial;
  // Comanda de caixa já fechado (ou de antes do caixa): só os dados da cliente mudam.
  travada?: boolean;
  // Comanda nova sem caixa aberto: o banco recusaria, então avisa antes de digitar tudo.
  semCaixaAberto?: boolean;
  podeAbrirCaixa?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [data, setData] = useState(inicial?.data ?? hojeSP());
  const [clienteNome, setClienteNome] = useState(inicial?.clienteNome ?? "");
  const [clienteContato, setClienteContato] = useState(inicial?.clienteContato ?? "");
  const [clienteId, setClienteId] = useState<string | null>(inicial?.clienteId ?? null);
  const [pagamentos, setPagamentos] = useState<Record<FormaPagamento, PagamentoForm>>(
    () => pagamentosIniciais(inicial?.pagamentos)
  );

  function atualizarPagamento(forma: FormaPagamento, campo: keyof PagamentoForm, valor: string | boolean) {
    setPagamentos((atual) => ({
      ...atual,
      [forma]: { ...atual[forma], [campo]: valor },
    }));
  }

  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const itensPorServico = new Map(
      (inicial?.itens ?? []).map((item) => [item.servico, item])
    );

    const linhasPadrao: Linha[] = servicos.map((servico) => {
      const item = itensPorServico.get(servico.nome);
      itensPorServico.delete(servico.nome);
      return {
        key: servico.id,
        servico: servico.nome,
        editavelNome: false,
        profissionalId: item?.profissionalId ?? "",
        valor: item && item.valor > 0 ? String(item.valor) : "",
      };
    });

    const linhasExtrasExistentes: Linha[] = Array.from(itensPorServico.values()).map(
      (item, i) => ({
        key: `extra-existente-${i}`,
        servico: item.servico,
        editavelNome: true,
        profissionalId: item.profissionalId ?? "",
        valor: String(item.valor),
      })
    );

    const linhasExtrasVazias: Linha[] = Array.from({ length: QTD_LINHAS_EXTRAS }).map(
      (_, i) => ({
        key: `extra-vazia-${i}`,
        servico: "",
        editavelNome: true,
        profissionalId: "",
        valor: "",
      })
    );

    return [...linhasPadrao, ...linhasExtrasExistentes, ...linhasExtrasVazias];
  });

  function atualizarLinha(key: string, campo: keyof Linha, valor: string) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.key === key ? { ...linha, [campo]: valor } : linha))
    );
  }

  const total = useMemo(
    () =>
      linhas.reduce((soma, linha) => {
        const valor = parseFloat(linha.valor.replace(",", "."));
        return soma + (isNaN(valor) ? 0 : valor);
      }, 0),
    [linhas]
  );

  const totalPago = useMemo(
    () =>
      Object.values(pagamentos).reduce((soma, p) => {
        if (!p.ativo) return soma;
        const valor = parseFloat(p.valor.replace(",", "."));
        return soma + (isNaN(valor) ? 0 : valor);
      }, 0),
    [pagamentos]
  );

  function alternarFormaPagamento(forma: FormaPagamento, ativo: boolean) {
    if (!ativo) {
      atualizarPagamento(forma, "ativo", false);
      return;
    }
    // Preenche automaticamente com o que ainda falta pagar do total da comanda.
    const jaPago = Object.entries(pagamentos).reduce((soma, [f, p]) => {
      if (f === forma || !p.ativo) return soma;
      const valor = parseFloat(p.valor.replace(",", "."));
      return soma + (isNaN(valor) ? 0 : valor);
    }, 0);
    const restante = Math.max(total - jaPago, 0);
    setPagamentos((atual) => ({
      ...atual,
      [forma]: {
        ...atual[forma],
        ativo: true,
        valor: restante > 0 ? restante.toFixed(2) : atual[forma].valor,
      },
    }));
  }

  function escolherTipoCartao(tipo: TipoCartao) {
    setPagamentos((atual) => ({
      ...atual,
      cartao: {
        ...atual.cartao,
        tipoCartao: tipo,
        // Débito não parcela — descarta um número de parcelas deixado de quando era crédito.
        parcelas: tipo === "credito" ? atual.cartao.parcelas : "",
      },
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (pagamentos.cartao.ativo && !pagamentos.cartao.tipoCartao) {
      setErro("Selecione Débito ou Crédito para o pagamento no cartão.");
      return;
    }

    const itens = linhas
      .filter((linha) => linha.servico.trim() && linha.valor.trim())
      .map((linha) => {
        const valor = parseFloat(linha.valor.replace(",", "."));
        return {
          servico: linha.servico.trim(),
          profissionalId: linha.profissionalId || null,
          valor: isNaN(valor) ? 0 : valor,
        };
      });

    const pagamentosItens: Pagamento[] = FORMAS.filter(
      ([forma]) => pagamentos[forma].ativo
    )
      .map(([forma]) => {
        const p = pagamentos[forma];
        const valor = parseFloat(p.valor.replace(",", "."));
        const recebido = numero(p.recebido);
        return {
          forma,
          valor: isNaN(valor) ? 0 : valor,
          parcelas: forma === "cartao" && p.parcelas ? parseInt(p.parcelas, 10) : null,
          tipo_cartao: forma === "cartao" ? (p.tipoCartao || null) : null,
          valor_recebido: forma === "dinheiro" && recebido > 0 ? recebido : null,
        };
      })
      .filter((p) => p.valor > 0);

    const dinheiro = pagamentosItens.find((p) => p.forma === "dinheiro");
    if (dinheiro?.valor_recebido && dinheiro.valor_recebido < dinheiro.valor) {
      setErro("O valor recebido em dinheiro é menor que o valor pago em dinheiro.");
      return;
    }

    startTransition(async () => {
      let idCliente = clienteId;

      if (!idCliente && clienteNome.trim()) {
        const confirmado = confirm(
          `Não encontramos "${clienteNome.trim()}" cadastrada. Cadastrar como nova cliente?`
        );
        if (!confirmado) {
          setErro("Corrija o nome ou escolha uma cliente da lista de sugestões.");
          return;
        }
        const resultadoCliente = await criarCliente(clienteNome, clienteContato);
        if (!resultadoCliente.ok) {
          setErro(resultadoCliente.error);
          return;
        }
        idCliente = resultadoCliente.id;
        setClienteId(idCliente);
      }

      const resultado = await salvarComanda(
        {
          data,
          clienteNome,
          clienteContato,
          clienteId: idCliente,
          pagamentos: pagamentosItens,
          itens,
          agendamentoId,
        },
        comandaId
      );
      if (resultado?.error) setErro(resultado.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {semCaixaAberto && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {podeAbrirCaixa ? (
            <>
              O caixa está fechado. Abra o caixa antes de lançar comandas.{" "}
              <Link href="/caixa" className="font-medium underline">
                Abrir caixa
              </Link>
            </>
          ) : (
            "O caixa está fechado. Peça para a administração abrir o caixa antes de lançar comandas."
          )}
        </div>
      )}
      {travada && (
        <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted">
          Esta comanda é de um caixa já fechado (ou de antes do controle de caixa). Serviços,
          valores e pagamentos não podem mais mudar — só os dados da cliente. Para receber o
          que faltou, use{" "}
          <Link href="/duplicatas" className="underline hover:text-accent-2">
            Duplicatas
          </Link>
          .
        </div>
      )}
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-foreground">Data</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            disabled={travada}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2 disabled:opacity-60"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Cliente</label>
          <div className="mt-1">
            <ClienteAutocomplete
              nome={clienteNome}
              onNomeChange={setClienteNome}
              onLimparCliente={() => setClienteId(null)}
              clienteVinculado={!!clienteId}
              onSelecionarCliente={(c) => {
                setClienteNome(c.nome);
                if (!clienteContato.trim() && c.contato) setClienteContato(c.contato);
                setClienteId(c.id);
              }}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Contato</label>
          <input
            value={clienteContato}
            onChange={(e) => setClienteContato(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent-2"
          />
        </div>
      </div>

      <fieldset disabled={travada} className="space-y-6 disabled:opacity-60">
      {/* Mobile: cards empilhados, sem scroll lateral */}
      <div className="space-y-2 sm:hidden">
        {linhas.map((linha) => (
          <div key={linha.key} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              {linha.editavelNome ? (
                <input
                  value={linha.servico}
                  onChange={(e) => atualizarLinha(linha.key, "servico", e.target.value)}
                  placeholder="Outro serviço"
                  className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm font-medium text-foreground outline-none focus:border-accent-2"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {linha.servico}
                </span>
              )}
              <input
                inputMode="decimal"
                value={linha.valor}
                onChange={(e) => atualizarLinha(linha.key, "valor", e.target.value)}
                placeholder="0,00"
                className="w-24 shrink-0 rounded border border-border bg-background px-2 py-1.5 text-right text-sm text-foreground outline-none focus:border-accent-2"
              />
            </div>
            <select
              value={linha.profissionalId}
              onChange={(e) => atualizarLinha(linha.key, "profissionalId", e.target.value)}
              className="mt-2 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent-2"
            >
              <option value="">Profissional — nenhum</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 font-semibold">
          <span>TOTAL</span>
          <span className="text-accent-2">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>
      </div>

      {/* Desktop: tabela */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="brand-gradient text-accent-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Serviço</th>
                <th className="px-4 py-2 font-medium">Profissional</th>
                <th className="w-32 px-4 py-2 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((linha) => (
                <tr key={linha.key} className="transition-colors hover:bg-card-hover">
                  <td className="px-4 py-1.5">
                    {linha.editavelNome ? (
                      <input
                        value={linha.servico}
                        onChange={(e) => atualizarLinha(linha.key, "servico", e.target.value)}
                        placeholder="Outro serviço"
                        className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-foreground outline-none transition-colors hover:border-border focus:border-accent-2"
                      />
                    ) : (
                      linha.servico
                    )}
                  </td>
                  <td className="px-4 py-1.5">
                    <select
                      value={linha.profissionalId}
                      onChange={(e) =>
                        atualizarLinha(linha.key, "profissionalId", e.target.value)
                      }
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-foreground outline-none transition-colors hover:border-border focus:border-accent-2"
                    >
                      <option className="bg-card" value="">
                        —
                      </option>
                      {profissionais.map((p) => (
                        <option className="bg-card" key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-1.5">
                    <input
                      inputMode="decimal"
                      value={linha.valor}
                      onChange={(e) => atualizarLinha(linha.key, "valor", e.target.value)}
                      placeholder="0,00"
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-foreground outline-none transition-colors hover:border-border focus:border-accent-2"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-background font-semibold">
                <td className="px-4 py-2" colSpan={2}>
                  TOTAL
                </td>
                <td className="px-4 py-2 text-right text-accent-2">
                  {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <label className="block text-sm font-medium text-foreground">
          Forma de pagamento
        </label>
        <p className="mt-0.5 text-xs text-muted">
          Marque mais de uma opção se o cliente dividir o pagamento.
        </p>
        <div className="mt-3 space-y-2">
          {FORMAS.map(([forma, rotulo]) => {
            const p = pagamentos[forma];
            return (
              <div
                key={forma}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
              >
                <label className="flex min-w-[140px] flex-1 items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={p.ativo}
                    onChange={(e) => alternarFormaPagamento(forma, e.target.checked)}
                    className="accent-accent-2"
                  />
                  {rotulo}
                </label>
                {p.ativo && (
                  <>
                    <input
                      inputMode="decimal"
                      value={p.valor}
                      onChange={(e) => atualizarPagamento(forma, "valor", e.target.value)}
                      placeholder="0,00"
                      className="w-24 rounded border border-border bg-card px-2 py-1 text-right text-sm text-foreground outline-none focus:border-accent-2"
                    />
                    {forma === "dinheiro" && (
                      <>
                        <input
                          inputMode="decimal"
                          value={p.recebido}
                          onChange={(e) => atualizarPagamento(forma, "recebido", e.target.value)}
                          placeholder="Recebido"
                          title="Quanto o cliente entregou (pra calcular o troco)"
                          className="w-24 rounded border border-border bg-card px-2 py-1 text-right text-sm text-foreground outline-none focus:border-accent-2"
                        />
                        {numero(p.recebido) > numero(p.valor) && (
                          <span className="text-sm font-medium text-accent-2">
                            Troco:{" "}
                            {(numero(p.recebido) - numero(p.valor)).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </span>
                        )}
                      </>
                    )}
                    {forma === "cartao" && (
                      <>
                        <div className="flex overflow-hidden rounded border border-border">
                          {(["debito", "credito"] as const).map((tipo) => (
                            <button
                              key={tipo}
                              type="button"
                              onClick={() => escolherTipoCartao(tipo)}
                              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                                p.tipoCartao === tipo
                                  ? "bg-accent-2 text-accent-foreground"
                                  : "bg-card text-muted hover:text-accent-2"
                              }`}
                            >
                              {tipo === "debito" ? "Débito" : "Crédito"}
                            </button>
                          ))}
                        </div>
                        {p.tipoCartao === "credito" && (
                          <input
                            type="number"
                            min={1}
                            value={p.parcelas}
                            onChange={(e) =>
                              atualizarPagamento(forma, "parcelas", e.target.value)
                            }
                            placeholder="Nº parcelas"
                            className="w-24 rounded border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-accent-2"
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div
          className={`mt-3 text-sm ${
            Math.abs(totalPago - total) < 0.01 ? "text-muted" : "text-danger"
          }`}
        >
          Pago: {totalPago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{" "}
          de {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </div>
      </div>
      </fieldset>

      {erro && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending || semCaixaAberto}
          className="brand-gradient glow-accent rounded-lg px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Salvando..." : "Salvar comanda"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:border-accent-2 hover:text-accent-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
