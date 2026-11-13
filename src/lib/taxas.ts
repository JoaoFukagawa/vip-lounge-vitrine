import type { Pagamento, TaxaCartao } from "./types";

// Quanto foi descontado da maquininha nessa comanda, em reais.
// Pagamentos sem tipo_cartao (dados antigos, de antes dessa feature) não entram
// na conta — não dá pra adivinhar se era débito ou crédito.
export function taxaCartaoValor(pagamentos: Pagamento[], taxas: TaxaCartao[]): number {
  const taxaPorTipo = new Map(taxas.map((t) => [t.tipo, t.taxa_percentual / 100]));
  let total = 0;
  for (const p of pagamentos) {
    if (p.forma !== "cartao" || !p.tipo_cartao) continue;
    total += p.valor * (taxaPorTipo.get(p.tipo_cartao) ?? 0);
  }
  return total;
}

// Taxa "efetiva" da comanda inteira (blended): a taxa de cartão diluída sobre o
// total, já que não dá pra saber qual serviço específico foi pago no cartão —
// aplica o mesmo desconto proporcional em todos os itens da comanda.
export function taxaEfetivaComanda(
  pagamentos: Pagamento[],
  total: number,
  taxas: TaxaCartao[]
): number {
  if (total <= 0) return 0;
  return taxaCartaoValor(pagamentos, taxas) / total;
}
