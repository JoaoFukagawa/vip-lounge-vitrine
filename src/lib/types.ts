export type Role = "admin" | "staff" | "recepcionista";

export type Profile = {
  id: string;
  nome: string;
  role: Role;
  especialidades: string[];
  ativo: boolean;
  desativado_em: string | null;
  // Proprietária: a parte do salão não é descontada dela nas comissões.
  isenta_parte_salao: boolean;
  created_at: string;
};

export type ProfissionalHorario = {
  id: string;
  profissional_id: string;
  dia_semana: number; // 0=dom .. 6=sáb
  horario_inicio: string; // "09:00:00"
  horario_fim: string; // "19:00:00"
};

export type FormaPagamento = "cartao" | "dinheiro" | "pix";
export type TipoCartao = "debito" | "credito";

export type Pagamento = {
  forma: FormaPagamento;
  valor: number;
  parcelas: number | null;
  // Só preenchido quando forma === "cartao". Registros antigos (antes dessa
  // feature) não têm esse campo — tratar como "sem taxa aplicada", não adivinhar.
  tipo_cartao?: TipoCartao | null;
  // Dinheiro: nota que o cliente entregou (troco = valor_recebido - valor).
  valor_recebido?: number | null;
  // Só em recebimento posterior (baixa de duplicata): caixa em que o dinheiro entrou.
  sessao_id?: string | null;
  recebido_em?: string | null;
};

export type CaixaStatus = "aberto" | "fechado" | "conferido";

export type CaixaSessao = {
  id: string;
  status: CaixaStatus;
  data_operacional: string;
  aberto_por: string;
  aberto_em: string;
  fundo_esperado: number;
  fundo_contado: number;
  justificativa_abertura: string | null;
  fechado_por: string | null;
  fechado_em: string | null;
  contado_dinheiro: number | null;
  informado_cartao: number | null;
  informado_pix: number | null;
  fundo_deixado: number | null;
  retirada_final: number | null;
  observacao_fechamento: string | null;
  conferido_por: string | null;
  conferido_em: string | null;
  observacao_conferencia: string | null;
};

export type CaixaApuracao = {
  sessao_id: string;
  esperado_dinheiro: number;
  esperado_cartao: number;
  esperado_pix: number;
  diferenca_dinheiro: number;
  diferenca_cartao: number;
  diferenca_pix: number;
};

export type CaixaMovimentoTipo = "suprimento" | "sangria" | "ajuste" | "estorno";

export type CaixaMovimento = {
  id: string;
  sessao_id: string;
  tipo: CaixaMovimentoTipo;
  sentido: "entrada" | "saida";
  valor: number;
  descricao: string;
  estorna_id: string | null;
  criado_por: string;
  created_at: string;
};

export type CaixaResumo = {
  fundo: number;
  comandas_dinheiro: number;
  comandas_pix: number;
  comandas_cartao: number;
  comandas_total: number;
  troco_dado: number;
  recebido_duplicatas: number;
  qtd_comandas: number;
  movimentos: { tipo: string; efeito: number }[];
  esperado_dinheiro: number;
  esperado_cartao: number;
  esperado_pix: number;
};

export type TaxaCartao = {
  tipo: TipoCartao;
  taxa_percentual: number;
  updated_at: string;
};

export type ComandaItem = {
  id: string;
  comanda_id: string;
  servico: string;
  profissional_id: string | null;
  valor: number;
  ordem: number;
  // Rastreio de pagamento da comissão desse item. Nulo em "pago_em" = pendente.
  comissao_pago_em: string | null;
  comissao_valor_pago: number | null;
  comissao_despesa_id: string | null;
};

export type Cliente = {
  id: string;
  nome: string;
  contato: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type Comanda = {
  id: string;
  data: string;
  cliente_nome: string | null;
  cliente_contato: string | null;
  cliente_id: string | null;
  pagamentos: Pagamento[];
  total: number;
  // Nulo = comanda de antes do controle de caixa.
  caixa_sessao_id: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type ComandaComItens = Comanda & {
  comanda_itens: ComandaItem[];
};

export type Servico = {
  id: string;
  nome: string;
  comissao_percentual: number;
  duracao_minutos: number;
  ativo: boolean;
  ordem: number;
  created_at: string;
};

export type AgendamentoStatus = "agendado" | "concluido" | "cancelado" | "nao_compareceu";

export type Agendamento = {
  id: string;
  data: string; // "2026-08-20"
  hora_inicio: string; // "14:30:00"
  duracao_minutos: number;
  hora_fim: string; // "15:30:00" — coluna gerada
  cliente_nome: string;
  cliente_contato: string | null;
  cliente_id: string | null;
  profissional_id: string;
  servico_id: string | null;
  status: AgendamentoStatus;
  observacoes: string | null;
  motivo_cancelamento: string | null;
  comanda_id: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type AgendamentoComRelacoes = Agendamento & {
  profissional: Pick<Profile, "id" | "nome"> | null;
  servico: Pick<Servico, "id" | "nome"> | null;
};

export type AgendamentoTransferencia = {
  id: string;
  agendamento_id: string;
  profissional_anterior_id: string;
  profissional_novo_id: string;
  motivo: string | null;
  transferido_por: string | null;
  created_at: string;
};

export type DespesaGrupo = {
  id: string;
  nome: string;
  ordem: number;
};

export type DespesaCategoria = {
  id: string;
  grupo_id: string;
  nome: string;
  ativa: boolean;
  sistema_chave: string | null;
  ordem: number;
  created_at: string;
};

export type DespesaCategoriaComGrupo = DespesaCategoria & {
  grupo: Pick<DespesaGrupo, "id" | "nome" | "ordem">;
};

export type FormaPagamentoDespesa =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "boleto"
  | "transferencia"
  | "outro";

export type DespesaStatus = "pago" | "a_pagar";

export type Despesa = {
  id: string;
  data: string; // "2026-11-01"
  categoria_id: string;
  descricao: string;
  fornecedor: string | null;
  valor: number;
  forma_pagamento: FormaPagamentoDespesa | null;
  status: DespesaStatus;
  data_vencimento: string | null;
  data_pagamento: string | null;
  observacoes: string | null;
  criado_por: string | null;
  // Preenchido quando o dinheiro saiu da gaveta do caixa.
  caixa_sessao_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DespesaComCategoria = Despesa & {
  categoria: Pick<DespesaCategoria, "id" | "nome"> & {
    grupo: Pick<DespesaGrupo, "id" | "nome">;
  };
};
