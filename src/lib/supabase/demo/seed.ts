// Dados 100% fictícios do modo demonstração, gerados a partir da data de hoje
// (fuso de São Paulo). Determinístico: o mesmo dia gera sempre os mesmos dados.
import { caixaCalcular, type DB, type Row } from "./engine";

export const DEMO_LOGIN_DOMAIN = "viplounge.local";

const SERVICOS: [nome: string, comissao: number, duracao: number, preco: number][] = [
  ["Lavagem", 50, 30, 35], ["Corte", 50, 60, 80], ["Escova", 50, 45, 60], ["Coloração", 50, 120, 180],
  ["Mechas", 50, 180, 350], ["Progressiva", 50, 180, 280], ["Cauterização", 50, 60, 120], ["Hidratação", 50, 45, 90],
  ["Blindagem", 50, 90, 150], ["Penteado", 50, 60, 120], ["Maquiagem", 50, 60, 130], ["Sobrancelha", 40, 30, 35],
  ["Sobrancelha Henna", 40, 45, 50], ["Micropigmentação Sob.", 50, 120, 450], ["Along. Cílios", 50, 120, 180],
  ["Dep. Facial", 40, 30, 40], ["Pé", 40, 45, 40], ["Mão", 40, 45, 35], ["Esmaltação Gel", 40, 60, 70],
];

type Pessoa = { user: string; nome: string; role: "admin" | "staff" | "recepcionista"; isenta?: boolean; esp: string[]; dias: number[]; ini: string; fim: string };
const EQUIPE: Pessoa[] = [
  { user: "admin", nome: "Camila Rocha", role: "admin", esp: ["Corte", "Coloração", "Mechas", "Escova"], dias: [0, 1, 2, 3, 4, 5, 6], ini: "10:00", fim: "16:00" },
  { user: "recepcao", nome: "Juliana Prado", role: "recepcionista", esp: [], dias: [], ini: "", fim: "" },
  { user: "ana", nome: "Ana Beatriz", role: "staff", esp: ["Corte", "Escova", "Progressiva", "Hidratação", "Lavagem", "Cauterização"], dias: [0, 1, 2, 3, 4, 5, 6], ini: "09:00", fim: "19:00" },
  { user: "renata", nome: "Renata Alves", role: "staff", esp: ["Corte", "Escova", "Penteado", "Blindagem", "Lavagem"], dias: [0, 1, 2, 3, 4, 5, 6], ini: "10:00", fim: "19:00" },
  { user: "larissa", nome: "Larissa Mendes", role: "staff", esp: ["Mão", "Pé", "Esmaltação Gel"], dias: [0, 1, 2, 3, 4, 5, 6], ini: "09:00", fim: "19:00" },
  { user: "patricia", nome: "Patrícia Lopes", role: "staff", esp: ["Sobrancelha", "Sobrancelha Henna", "Dep. Facial", "Along. Cílios", "Maquiagem", "Micropigmentação Sob."], dias: [0, 1, 3, 4, 5, 6], ini: "10:00", fim: "18:00" },
];

const CLIENTES = [
  "Aline Ferraz", "Beatriz Couto", "Bianca Lemos", "Carolina Dias", "Cecília Nogueira", "Daniela Fontes", "Débora Matos",
  "Eduarda Sales", "Elaine Pires", "Fernanda Gomes", "Flávia Antunes", "Gabriela Reis", "Giovana Martins", "Helena Castro",
  "Isadora Lima", "Jéssica Duarte", "Joana Ribeiro", "Karina Moraes", "Letícia Araújo", "Luana Barros", "Mariana Teixeira",
  "Marina Coelho", "Melissa Rangel", "Natália Brito", "Olívia Campos", "Paula Cardoso", "Priscila Viana", "Rafaela Tavares",
  "Raquel Monteiro", "Sabrina Lacerda", "Simone Freitas", "Tatiane Rezende", "Thaís Moura", "Valéria Peixoto", "Vanessa Quintela",
  "Vitória Bastos", "Yasmin Correia", "Lucas Andrade", "Pedro Henrique Sá", "Rodrigo Mattos",
];

const GRUPOS: [string, number][] = [
  ["Fixas do salão", 10], ["Produtos e materiais", 20], ["Pessoal", 30], ["Impostos e taxas", 40], ["Operação e crescimento", 50], ["Outros", 60],
];
const CATEGORIAS: [grupo: string, nome: string, ordem: number, chave: string | null][] = [
  ["Fixas do salão", "Aluguel", 10, null], ["Fixas do salão", "Energia elétrica", 20, null], ["Fixas do salão", "Água", 30, null],
  ["Fixas do salão", "Internet e telefone", 40, null], ["Fixas do salão", "Condomínio e IPTU", 50, null],
  ["Fixas do salão", "Sistema e software", 60, null], ["Fixas do salão", "Contador", 70, null],
  ["Produtos e materiais", "Produtos de cabelo", 10, null], ["Produtos e materiais", "Produtos de estética", 20, null],
  ["Produtos e materiais", "Descartáveis", 30, null], ["Produtos e materiais", "Material de limpeza", 40, null],
  ["Produtos e materiais", "Uniformes", 50, null],
  ["Pessoal", "Comissões pagas às profissionais", 10, "comissoes_pagas"], ["Pessoal", "Salário fixo", 20, null],
  ["Pessoal", "Pró-labore", 30, null], ["Pessoal", "Vale-transporte e benefícios", 40, null], ["Pessoal", "Encargos (INSS, FGTS)", 50, null],
  ["Impostos e taxas", "Simples Nacional / MEI", 10, null], ["Impostos e taxas", "Taxa de maquininha", 20, null],
  ["Operação e crescimento", "Marketing e anúncios", 10, null], ["Operação e crescimento", "Manutenção de equipamentos", 20, null],
  ["Operação e crescimento", "Reformas e melhorias", 30, null], ["Operação e crescimento", "Cursos e treinamentos", 40, null],
  ["Operação e crescimento", "Cortesias para clientes", 50, null], ["Outros", "Diversos", 10, null],
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
const ts = (data: string, min: number) => new Date(`${data}T${hhmm(min)}-03:00`).toISOString();
const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildSeed(hoje: string, agoraISO: string): DB {
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
  const rand = rng(Number(hoje.replace(/-/g, "")));
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const agoraMin = (() => {
    const p = new Date(agoraISO).toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour12: false });
    return toMin(p);
  })();
  const inicio = addDias(hoje, -75);
  const created = ts(inicio, 9 * 60);

  // ---------- equipe ----------
  const profiles: Row[] = [];
  const authUsers: DB["authUsers"] = [];
  const horarios: Row[] = [];
  const pessoaId = new Map<string, string>();
  for (const p of EQUIPE) {
    const pid = id();
    pessoaId.set(p.user, pid);
    authUsers.push({ id: pid, email: `${p.user}@${DEMO_LOGIN_DOMAIN}` });
    profiles.push({ id: pid, nome: p.nome, role: p.role, especialidades: p.esp, ativo: true, desativado_em: null, isenta_parte_salao: !!p.isenta, created_at: created });
    for (const d of p.dias) horarios.push({ id: id(), profissional_id: pid, dia_semana: d, horario_inicio: `${p.ini}:00`, horario_fim: `${p.fim}:00` });
  }
  const adminId = pessoaId.get("admin")!;
  const recepId = pessoaId.get("recepcao")!;
  const profissionais = EQUIPE.filter((p) => p.dias.length);

  const servicos: Row[] = SERVICOS.map(([nome, comissao_percentual, duracao_minutos], i) => ({
    id: id(), nome, comissao_percentual, duracao_minutos, ativo: true, ordem: i, created_at: created,
  }));
  const servicoPorNome = new Map(servicos.map((s) => [s.nome, s]));
  const preco = new Map(SERVICOS.map(([nome, , , p]) => [nome, p]));

  const clientes: Row[] = CLIENTES.map((nome, i) => ({
    id: id(), nome, contato: `(11) 90000-${String(i + 1).padStart(4, "0")}`,
    observacoes: i % 7 === 0 ? "Prefere horário pela manhã" : i % 9 === 0 ? "Alergia a amônia" : null, created_at: created, updated_at: created,
  }));

  const taxas_cartao = [
    { tipo: "debito", taxa_percentual: 1.5, updated_at: created },
    { tipo: "credito", taxa_percentual: 3.5, updated_at: created },
  ];

  const despesa_grupos = GRUPOS.map(([nome, ordem]) => ({ id: id(), nome, ordem }));
  const grupoId = new Map(despesa_grupos.map((g) => [g.nome, g.id]));
  const despesa_categorias = CATEGORIAS.map(([g, nome, ordem, chave]) => ({
    id: id(), grupo_id: grupoId.get(g)!, nome, ativa: true, sistema_chave: chave, ordem, created_at: created,
  }));
  const catId = (nome: string) => despesa_categorias.find((c) => c.nome === nome)!.id;

  // ---------- agenda, comandas e caixa ----------
  const agendamentos: Row[] = [];
  const comandas: Row[] = [];
  const comanda_itens: Row[] = [];
  const caixa_sessoes: Row[] = [];
  const caixa_movimentos: Row[] = [];
  const caixa_eventos: Row[] = [];
  const caixa_apuracoes: Row[] = [];
  const despesas: Row[] = [];

  const pagar = (total: number, fiado: boolean) => {
    const roll = rand();
    const pago = fiado ? r2(Math.floor((total * (0.3 + rand() * 0.4)) / 5) * 5) : total;
    if (roll < 0.38) return [{ forma: "pix", valor: pago, parcelas: null }];
    if (roll < 0.62) {
      const recebido = Math.ceil(pago / 50) * 50;
      return [{ forma: "dinheiro", valor: pago, parcelas: null, valor_recebido: recebido === pago ? null : recebido }];
    }
    const credito = rand() < 0.55;
    return [{ forma: "cartao", valor: pago, tipo_cartao: credito ? "credito" : "debito", parcelas: credito ? (pago > 250 ? between(2, 3) : 1) : null }];
  };

  const dias: string[] = [];
  for (let d = 45; d >= 0; d--) {
    const data = addDias(hoje, -d);
    if (d === 0 || ![0, 1].includes(dow(data))) dias.push(data); // fechado domingo e segunda (hoje sempre aberto na demo)
  }

  let fundoAnterior = 200;
  dias.forEach((data, idx) => {
    const ehHoje = data === hoje;
    const ultimoPassado = idx === dias.length - 2;
    const sid = id();
    const abertura = 8 * 60 + 45;
    caixa_sessoes.push({
      id: sid, status: ehHoje ? "aberto" : ultimoPassado ? "fechado" : "conferido", data_operacional: data,
      aberto_por: adminId, aberto_em: ts(data, abertura), fundo_esperado: fundoAnterior, fundo_contado: fundoAnterior,
      fundo_cedulas: null, justificativa_abertura: null, fechado_por: null, fechado_em: null, contado_dinheiro: null,
      contado_cedulas: null, informado_cartao: null, informado_pix: null, fundo_deixado: null, retirada_final: null,
      observacao_fechamento: null, conferido_por: null, conferido_em: null, observacao_conferencia: null,
    });
    caixa_eventos.push({ id: id(), sessao_id: sid, evento: "abertura", motivo: null, detalhe: null, feito_por: adminId, created_at: ts(data, abertura) });

    // agenda de cada profissional
    const atendidos: { pessoa: Pessoa; servico: string; ini: number; cliente: Row; ag: Row }[] = [];
    for (const p of profissionais) {
      if (!p.dias.includes(dow(data))) continue;
      const h = { ini: toMin(p.ini), fim: toMin(p.fim) };
      let t = h.ini + (rand() < 0.5 ? 0 : 30);
      while (t < h.fim) {
        const servico = pick(p.esp);
        const dur = servicoPorNome.get(servico)!.duracao_minutos;
        if (t + dur > h.fim) break;
        if (rand() < 0.5) {
          const cliente = pick(clientes);
          const passou = !ehHoje || t + dur <= agoraMin;
          const roll = rand();
          const status = !passou ? "agendado" : roll < 0.86 ? "concluido" : roll < 0.94 ? "cancelado" : "nao_compareceu";
          const ag = {
            id: id(), data, hora_inicio: hhmm(t), duracao_minutos: dur, hora_fim: hhmm(t + dur), cliente_nome: cliente.nome,
            cliente_contato: cliente.contato, cliente_id: cliente.id, profissional_id: pessoaId.get(p.user)!, servico_id: servicoPorNome.get(servico)!.id,
            status, observacoes: null, motivo_cancelamento: status === "cancelado" ? "Cliente desmarcou pelo WhatsApp" : null,
            comanda_id: null, criado_por: recepId, created_at: ts(addDias(data, -between(1, 6)), 10 * 60 + between(0, 400)), updated_at: ts(data, t),
          };
          agendamentos.push(ag);
          if (status === "concluido") atendidos.push({ pessoa: p, servico, ini: t, cliente, ag });
          t += dur;
        } else t += 30;
      }
    }

    // uma comanda por cliente atendida no dia (+ alguns encaixes)
    const porCliente = new Map<string, typeof atendidos>();
    for (const a of atendidos) porCliente.set(a.cliente.id, [...(porCliente.get(a.cliente.id) ?? []), a]);
    for (const [, lista] of porCliente) {
      const cliente = lista[0].cliente;
      const fim = Math.max(...lista.map((a) => a.ini + servicoPorNome.get(a.servico)!.duracao_minutos));
      const cid = id();
      const itens = lista.map((a, i) => ({
        id: id(), comanda_id: cid, servico: a.servico, profissional_id: pessoaId.get(a.pessoa.user)!, valor: preco.get(a.servico)!, ordem: i,
        comissao_pago_em: null, comissao_valor_pago: null, comissao_despesa_id: null,
      }));
      if (rand() < 0.15) {
        const extra = pick(["Hidratação", "Sobrancelha", "Esmaltação Gel"]);
        const quem = profissionais.find((p) => p.esp.includes(extra))!;
        itens.push({ id: id(), comanda_id: cid, servico: extra, profissional_id: pessoaId.get(quem.user)!, valor: preco.get(extra)!, ordem: itens.length, comissao_pago_em: null, comissao_valor_pago: null, comissao_despesa_id: null });
      }
      const total = itens.reduce((s, it) => s + it.valor, 0);
      const fiado = rand() < 0.05 && idx < dias.length - 1;
      comandas.push({
        id: cid, data, cliente_nome: cliente.nome, cliente_contato: cliente.contato, cliente_id: cliente.id, pagamentos: pagar(total, fiado), total,
        caixa_sessao_id: sid, criado_por: pick([recepId, adminId]), created_at: ts(data, fim + 5), updated_at: ts(data, fim + 5),
      });
      comanda_itens.push(...itens);
      lista.forEach((a) => (a.ag.comanda_id = cid));
    }

    // saídas da gaveta
    if (!ehHoje && rand() < 0.35) {
      caixa_movimentos.push({ id: id(), sessao_id: sid, tipo: "sangria", sentido: "saida", valor: 300, descricao: "Depósito no banco", estorna_id: null, criado_por: adminId, created_at: ts(data, 15 * 60) });
    }
    if (rand() < 0.3) {
      despesas.push({
        id: id(), data, categoria_id: catId("Diversos"), descricao: pick(["Café e água para clientes", "Lanche da equipe", "Pilhas para o secador"]),
        fornecedor: null, valor: between(15, 45), forma_pagamento: "dinheiro", status: "pago", data_vencimento: null, data_pagamento: data,
        observacoes: null, criado_por: adminId, caixa_sessao_id: sid, created_at: ts(data, 12 * 60), updated_at: ts(data, 12 * 60),
      });
    }
    if (ehHoje) return;

    // fechamento do dia
    const db0 = { tables: { caixa_sessoes, comandas, caixa_movimentos, despesas, despesa_categorias }, authUsers: [] } as unknown as DB;
    const calc = caixaCalcular(db0, sid);
    const diferenca = rand() < 0.12 ? -between(1, 5) : 0;
    const contado = r2(calc.esperado_dinheiro + diferenca);
    const fundoDeixado = Math.min(200, contado);
    const s = caixa_sessoes[caixa_sessoes.length - 1];
    Object.assign(s, {
      fechado_por: adminId, fechado_em: ts(data, 19 * 60 + 20), contado_dinheiro: contado, informado_cartao: calc.esperado_cartao,
      informado_pix: calc.esperado_pix, fundo_deixado: fundoDeixado, retirada_final: r2(contado - fundoDeixado),
      observacao_fechamento: diferenca ? "Faltou troco miúdo" : null,
    });
    caixa_apuracoes.push({
      sessao_id: sid, esperado_dinheiro: calc.esperado_dinheiro, esperado_cartao: calc.esperado_cartao, esperado_pix: calc.esperado_pix,
      diferenca_dinheiro: r2(contado - calc.esperado_dinheiro), diferenca_cartao: 0, diferenca_pix: 0, detalhe: calc, created_at: s.fechado_em,
    });
    caixa_eventos.push({ id: id(), sessao_id: sid, evento: "fechamento", motivo: s.observacao_fechamento, detalhe: null, feito_por: adminId, created_at: s.fechado_em });
    if (s.status === "conferido") {
      Object.assign(s, { conferido_por: adminId, conferido_em: ts(addDias(data, 1), 9 * 60), observacao_conferencia: diferenca ? "Diferença pequena, ok" : null });
      caixa_eventos.push({ id: id(), sessao_id: sid, evento: "conferencia", motivo: s.observacao_conferencia, detalhe: null, feito_por: adminId, created_at: s.conferido_em });
    }
    fundoAnterior = fundoDeixado;
  });

  // ---------- agenda futura (próximos 14 dias) ----------
  for (let d = 1; d <= 14; d++) {
    const data = addDias(hoje, d);
    if ([0, 1].includes(dow(data))) continue; // domingo e segunda: salão fechado
    for (const p of profissionais) {
      if (!p.dias.includes(dow(data))) continue;
      let t = toMin(p.ini);
      const fim = toMin(p.fim);
      const ocupacao = Math.max(0.12, 0.6 - d * 0.035);
      while (t < fim) {
        const servico = pick(p.esp);
        const dur = servicoPorNome.get(servico)!.duracao_minutos;
        if (t + dur > fim) break;
        if (rand() < ocupacao) {
          const cliente = pick(clientes);
          agendamentos.push({
            id: id(), data, hora_inicio: hhmm(t), duracao_minutos: dur, hora_fim: hhmm(t + dur), cliente_nome: cliente.nome,
            cliente_contato: cliente.contato, cliente_id: cliente.id, profissional_id: pessoaId.get(p.user)!, servico_id: servicoPorNome.get(servico)!.id,
            status: "agendado", observacoes: rand() < 0.1 ? "Primeira vez no salão" : null, motivo_cancelamento: null, comanda_id: null,
            criado_por: recepId, created_at: ts(hoje, 9 * 60), updated_at: ts(hoje, 9 * 60),
          });
          t += dur;
        } else t += 30;
      }
    }
  }

  // ---------- comissões pagas (todo sábado, no fim da semana trabalhada) ----------
  const servicoPct = new Map(servicos.map((s) => [s.nome, s.comissao_percentual]));
  const taxa = { debito: 0.015, credito: 0.035 } as Record<string, number>;
  const sabadoDe = (data: string) => addDias(data, (6 - dow(data) + 7) % 7);
  const pagamentosPorProf = new Map<string, Row[]>();
  for (const c of comandas) {
    if (sabadoDe(c.data) >= hoje) continue; // semana ainda não fechada: comissão pendente
    const pago = c.pagamentos.reduce((s: number, p: Row) => s + p.valor, 0);
    if (pago < c.total) continue; // comanda em aberto: comissão espera
    const taxaCartao = c.pagamentos.reduce((s: number, p: Row) => s + (p.forma === "cartao" ? p.valor * (taxa[p.tipo_cartao] ?? 0) : 0), 0) / c.total;
    for (const it of comanda_itens.filter((i) => i.comanda_id === c.id)) {
      const pessoa = profiles.find((p) => p.id === it.profissional_id)!;
      const parteSalao = pessoa.isenta_parte_salao ? 0 : (servicoPct.get(it.servico) ?? 30) / 100;
      it.comissao_valor_pago = r2(it.valor * (1 - parteSalao) * (1 - taxaCartao));
      pagamentosPorProf.set(it.profissional_id, [...(pagamentosPorProf.get(it.profissional_id) ?? []), { it, data: c.data }]);
    }
  }
  for (const [profId, lista] of pagamentosPorProf) {
    const porSemana = new Map<string, Row[]>();
    for (const x of lista) {
      const sabado = sabadoDe(x.data);
      porSemana.set(sabado, [...(porSemana.get(sabado) ?? []), x]);
    }
    const nome = profiles.find((p) => p.id === profId)!.nome;
    for (const [sabado, itens] of porSemana) {
      const did = id();
      const valor = r2(itens.reduce((s, x) => s + x.it.comissao_valor_pago, 0));
      despesas.push({
        id: did, data: sabado, categoria_id: catId("Comissões pagas às profissionais"), descricao: `Comissão — ${nome}`, fornecedor: nome,
        valor, forma_pagamento: "pix", status: "pago", data_vencimento: null, data_pagamento: sabado, observacoes: null, criado_por: adminId,
        caixa_sessao_id: null, created_at: ts(sabado, 19 * 60 + 30), updated_at: ts(sabado, 19 * 60 + 30),
      });
      for (const x of itens) {
        x.it.comissao_pago_em = ts(sabado, 19 * 60 + 30);
        x.it.comissao_despesa_id = did;
      }
    }
  }

  // ---------- despesas fixas e compras ----------
  const desp = (data: string, cat: string, descricao: string, valor: number, extra: Row = {}) =>
    despesas.push({
      id: id(), data, categoria_id: catId(cat), descricao, fornecedor: null, valor, forma_pagamento: "pix", status: "pago",
      data_vencimento: null, data_pagamento: data, observacoes: null, criado_por: adminId, caixa_sessao_id: null,
      created_at: ts(data, 11 * 60), updated_at: ts(data, 11 * 60), ...extra,
    });
  const [ano, mes] = hoje.split("-").map(Number);
  for (let m = -2; m <= 1; m++) {
    const ref = new Date(Date.UTC(ano, mes - 1 + m, 1));
    const ym = ref.toISOString().slice(0, 7);
    const fixas: [string, string, number, number][] = [
      ["Aluguel", "Aluguel do ponto", 3800, 5], ["Energia elétrica", "Conta de luz", 520 + m * 15, 10], ["Água", "Conta de água", 135, 12],
      ["Internet e telefone", "Internet fibra", 129.9, 15], ["Sistema e software", "Sistema de gestão", 89.9, 15],
      ["Contador", "Honorários contábeis", 450, 20], ["Simples Nacional / MEI", "DAS do mês", 612.4, 20],
    ];
    for (const [cat, descricao, valor, dia] of fixas) {
      const data = `${ym}-${String(dia).padStart(2, "0")}`;
      if (data < inicio) continue;
      if (data <= hoje) desp(data, cat, descricao, valor, { forma_pagamento: cat === "Aluguel" ? "transferencia" : "boleto" });
      else desp(data, cat, descricao, valor, { status: "a_pagar", forma_pagamento: "boleto", data_vencimento: data, data_pagamento: null });
    }
  }
  for (let d = 40; d >= 1; d -= 7) {
    const data = addDias(hoje, -d);
    desp(data, "Produtos de cabelo", pick(["Coloração e oxidante", "Shampoo e máscara (atacado)", "Kit progressiva"]), between(380, 920), { fornecedor: "Distribuidora Beleza Pura" });
    if (d % 2) desp(data, "Descartáveis", "Luvas, toalhas e papel", between(90, 160), { forma_pagamento: "debito" });
  }
  desp(addDias(hoje, -18), "Marketing e anúncios", "Impulsionamento Instagram", 250, { forma_pagamento: "credito" });
  desp(addDias(hoje, -30), "Manutenção de equipamentos", "Conserto de secador", 180);
  desp(addDias(hoje, -26), "Produtos de estética", "Cola e fios para cílios", 310, { forma_pagamento: "credito" });
  desp(addDias(hoje, 6), "Uniformes", "Aventais novos (6 un.)", 420, { status: "a_pagar", forma_pagamento: "boleto", data_vencimento: addDias(hoje, 6), data_pagamento: null });

  return {
    tables: {
      profiles, profissional_horarios: horarios, servicos, clientes, taxas_cartao, despesa_grupos, despesa_categorias,
      agendamentos, agendamento_transferencias: [], comandas, comanda_itens, despesas,
      caixa_sessoes, caixa_movimentos, caixa_eventos, caixa_apuracoes,
    },
    authUsers,
  };
}
