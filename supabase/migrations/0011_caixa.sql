-- Controle de caixa (gaveta de dinheiro): abrir com fundo de troco, acompanhar
-- entradas e saídas em dinheiro do dia, fechar contando a gaveta e conferir.
--
-- Encaixa no que já existe:
--   * recebimentos: continuam em comandas.pagamentos (jsonb). O pagamento em
--     dinheiro ganha o campo opcional "valor_recebido" (nota que o cliente deu),
--     e o troco é calculado a partir dele.
--   * fiado (duplicatas): o caixa fecha mesmo com comanda em aberto. O restante,
--     quando a cliente paga, é acrescentado pela função receber_pagamento com
--     "sessao_id" do caixa aberto naquele dia — conta no caixa do dia em que o
--     dinheiro entrou, sem mexer no caixa já fechado da comanda original.
--   * saídas: despesas pagas com dinheiro da gaveta são despesas normais com
--     caixa_sessao_id preenchido (inclui pagamento de comissão em dinheiro).
--   * caixa_movimentos guarda só o que não é comanda nem despesa: suprimento,
--     sangria, ajuste e estorno.
-- Tudo que o caixa soma fica travado depois que ele é fechado.

begin;

-- ── Reparo ──────────────────────────────────────────────────────────────────
-- Em 31/10–01/11/2026 uma migração de caixa de outro projeto (salao-saas-base,
-- 0006_caixa.sql) foi aplicada neste banco por engano: moveu comandas.pagamentos
-- para a tabela comanda_pagamentos (sem o débito/crédito do cartão), apagou a
-- coluna e criou um caixa incompatível com este sistema. Este bloco desfaz isso
-- sem perder nada: reconstrói comandas.pagamentos, confere os totais, guarda
-- comanda_pagamentos inteira no esquema "backup" e remove o caixa errado — só
-- se ele estiver vazio. Num banco que nunca recebeu aquela migração, não faz nada.
do $$
declare
  v_tem_dados boolean;
  v_linhas bigint;
  v_soma numeric;
  v_elementos bigint;
  v_soma_json numeric;
  v_fk text;
begin
  if to_regclass('public.comanda_pagamentos') is null then
    return;
  end if;

  execute $q$
    select exists (select 1 from public.caixa_sessoes)
        or exists (select 1 from public.caixa_movimentos)
        or exists (select 1 from public.caixa_apuracoes)
        or exists (select 1 from public.caixa_eventos)
        or exists (select 1 from public.comandas where caixa_sessao_id is not null)
  $q$ into strict v_tem_dados;
  if v_tem_dados then
    raise exception 'Reparo cancelado: o caixa antigo já tem dados. Nada foi alterado.';
  end if;

  execute 'drop trigger comandas_trava_caixa on public.comandas';
  execute 'drop trigger comanda_itens_trava_caixa on public.comanda_itens';
  execute 'drop trigger comanda_pagamentos_trava_caixa on public.comanda_pagamentos';
  execute 'drop trigger caixa_movimentos_sem_update_delete on public.caixa_movimentos';

  -- Reconstrói o jsonb no formato que o sistema usa. tipo_cartao fica nulo: a
  -- migração errada não copiou esse dado.
  execute $q$alter table public.comandas add column pagamentos jsonb not null default '[]'::jsonb$q$;
  execute $q$
    update public.comandas c
    set pagamentos = x.pags
    from (
      select comanda_id,
             jsonb_agg(
               jsonb_build_object('forma', forma, 'valor', valor, 'parcelas', parcelas, 'tipo_cartao', null)
               || case when valor_recebido is not null
                       then jsonb_build_object('valor_recebido', valor_recebido)
                       else '{}'::jsonb end
               order by id
             ) as pags
      from public.comanda_pagamentos
      group by comanda_id
    ) x
    where x.comanda_id = c.id
  $q$;

  execute 'select count(*), coalesce(sum(valor), 0) from public.comanda_pagamentos'
    into v_linhas, v_soma;
  select count(*), coalesce(sum((p->>'valor')::numeric), 0) into v_elementos, v_soma_json
  from public.comandas c, jsonb_array_elements(c.pagamentos) p;
  if v_elementos <> v_linhas or v_soma_json <> v_soma then
    raise exception 'Reparo cancelado: pagamentos reconstruídos (% / %) não batem com o original (% / %). Nada foi alterado.',
      v_elementos, v_soma_json, v_linhas, v_soma;
  end if;

  -- Guarda a tabela inteira, fora da API, sem vínculo com comandas.
  select conname into v_fk
  from pg_constraint
  where conrelid = 'public.comanda_pagamentos'::regclass and contype = 'f';
  if v_fk is not null then
    execute format('alter table public.comanda_pagamentos drop constraint %I', v_fk);
  end if;
  execute 'create schema if not exists backup';
  execute 'alter table public.comanda_pagamentos rename to comanda_pagamentos_20261102';
  execute 'alter table public.comanda_pagamentos_20261102 set schema backup';

  execute 'drop function public.salvar_comanda(uuid, text, text, jsonb, jsonb, uuid)';
  execute 'drop function public.caixa_pagamentos_profissionais(date, date)';
  execute 'drop function public.caixa_resumo(uuid)';
  execute 'drop function public.caixa_pendencias(uuid)';
  execute 'drop function public.caixa_calcular(uuid)';
  execute 'drop function public.abrir_caixa(numeric, jsonb, text)';
  execute 'drop function public.lancar_movimento(text, text, numeric, text, text, uuid, text)';
  execute 'drop function public.estornar_movimento(uuid, text)';
  execute 'drop function public.fechar_caixa(numeric, jsonb, numeric, numeric, numeric, text)';
  execute 'drop function public.conferir_caixa(uuid, text)';
  execute 'drop function public.reabrir_caixa(uuid, text)';
  execute 'drop function public.comandas_trava_caixa()';
  execute 'drop function public.comanda_filhos_trava_caixa()';
  execute 'drop function public.caixa_movimentos_imutavel()';

  execute 'alter table public.comandas drop column caixa_sessao_id';
  execute 'drop table public.caixa_eventos';
  execute 'drop table public.caixa_movimentos';
  execute 'drop table public.caixa_apuracoes';
  execute 'drop table public.caixa_sessoes';
end;
$$;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- "Hoje" no fuso do salão (o banco roda em UTC).
create or replace function public.hoje_sp()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ── Sessões de caixa ────────────────────────────────────────────────────────
create table public.caixa_sessoes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'aberto' check (status in ('aberto', 'fechado', 'conferido')),
  data_operacional date not null default public.hoje_sp(),

  -- Abertura: o que o fechamento anterior deixou x o que foi contado agora
  aberto_por uuid not null references public.profiles(id),
  aberto_em timestamptz not null default now(),
  fundo_esperado numeric(10, 2) not null default 0 check (fundo_esperado >= 0),
  fundo_contado numeric(10, 2) not null check (fundo_contado >= 0),
  fundo_cedulas jsonb,
  justificativa_abertura text,

  -- Fechamento (cego para quem não é admin: o esperado fica em caixa_apuracoes)
  fechado_por uuid references public.profiles(id),
  fechado_em timestamptz,
  contado_dinheiro numeric(10, 2) check (contado_dinheiro >= 0),
  contado_cedulas jsonb,
  informado_cartao numeric(10, 2) check (informado_cartao >= 0),
  informado_pix numeric(10, 2) check (informado_pix >= 0),
  fundo_deixado numeric(10, 2) check (fundo_deixado >= 0),
  retirada_final numeric(10, 2) generated always as (contado_dinheiro - fundo_deixado) stored,
  observacao_fechamento text,

  -- Conferência do admin
  conferido_por uuid references public.profiles(id),
  conferido_em timestamptz,
  observacao_conferencia text,

  check (fundo_deixado is null or fundo_deixado <= contado_dinheiro)
);

-- Só um caixa aberto por vez.
create unique index caixa_sessoes_um_aberto on public.caixa_sessoes ((true)) where status = 'aberto';
create index caixa_sessoes_data_idx on public.caixa_sessoes (data_operacional desc);

alter table public.caixa_sessoes enable row level security;

create policy "caixa_sessoes_select_authenticated"
  on public.caixa_sessoes for select
  to authenticated
  using (true);
-- Sem policies de escrita: só as funções abaixo escrevem.

-- Valores esperados congelados no fechamento. Separado da sessão para o
-- fechamento ser cego: só admin lê.
create table public.caixa_apuracoes (
  sessao_id uuid primary key references public.caixa_sessoes(id),
  esperado_dinheiro numeric(10, 2) not null,
  esperado_cartao numeric(10, 2) not null,
  esperado_pix numeric(10, 2) not null,
  diferenca_dinheiro numeric(10, 2) not null,
  diferenca_cartao numeric(10, 2) not null,
  diferenca_pix numeric(10, 2) not null,
  detalhe jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.caixa_apuracoes enable row level security;

create policy "caixa_apuracoes_select_admin"
  on public.caixa_apuracoes for select
  to authenticated
  using (public.is_admin());

-- ── Movimentos avulsos da gaveta (sempre dinheiro) ──────────────────────────
create table public.caixa_movimentos (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.caixa_sessoes(id),
  tipo text not null check (tipo in ('suprimento', 'sangria', 'ajuste', 'estorno')),
  sentido text not null check (sentido in ('entrada', 'saida')),
  valor numeric(10, 2) not null check (valor > 0), -- sempre positivo; o sinal vem do sentido
  descricao text not null,
  estorna_id uuid unique references public.caixa_movimentos(id), -- só um estorno por lançamento
  criado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((tipo = 'estorno') = (estorna_id is not null))
);

alter table public.caixa_movimentos enable row level security;

create policy "caixa_movimentos_select_authenticated"
  on public.caixa_movimentos for select
  to authenticated
  using (true);

create index caixa_movimentos_sessao_idx on public.caixa_movimentos(sessao_id);

-- ── Log (abriu, fechou, reabriu, conferiu) ──────────────────────────────────
create table public.caixa_eventos (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.caixa_sessoes(id),
  evento text not null check (evento in ('abertura', 'fechamento', 'reabertura', 'conferencia')),
  motivo text,
  detalhe jsonb,
  feito_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.caixa_eventos enable row level security;

create policy "caixa_eventos_select_admin"
  on public.caixa_eventos for select
  to authenticated
  using (public.is_admin());

-- ── Ligações com comandas e despesas ────────────────────────────────────────
-- Comandas antigas ficam com caixa_sessao_id nulo (histórico, fora do caixa).
alter table public.comandas add column caixa_sessao_id uuid references public.caixa_sessoes(id);
create index comandas_caixa_sessao_idx on public.comandas(caixa_sessao_id);
-- Acha comandas antigas com recebimento posterior marcado com o caixa (sessao_id no jsonb).
create index comandas_pagamentos_gin on public.comandas using gin (pagamentos jsonb_path_ops);

-- Preenchido só quando a despesa foi paga com dinheiro da gaveta.
alter table public.despesas add column caixa_sessao_id uuid references public.caixa_sessoes(id);
create index despesas_caixa_sessao_idx on public.despesas(caixa_sessao_id);

-- ── Cálculo ─────────────────────────────────────────────────────────────────

-- Totais de uma sessão. Estorno conta no tipo do lançamento original.
-- Cada pagamento conta no caixa marcado nele (recebimento posterior) ou, se não
-- tiver marca, no caixa da comanda.
create function public.caixa_calcular(p_sessao_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pag as (
    select
      p->>'forma' as forma,
      sum((p->>'valor')::numeric) as valor,
      sum(greatest(coalesce((p->>'valor_recebido')::numeric, (p->>'valor')::numeric)
                   - (p->>'valor')::numeric, 0)) as troco,
      sum(case when c.caixa_sessao_id is distinct from p_sessao_id
               then (p->>'valor')::numeric else 0 end) as posterior
    from public.comandas c, jsonb_array_elements(c.pagamentos) p
    where (c.caixa_sessao_id = p_sessao_id
           or c.pagamentos @> jsonb_build_array(jsonb_build_object('sessao_id', p_sessao_id::text)))
      and coalesce(p->>'sessao_id', c.caixa_sessao_id::text) = p_sessao_id::text
    group by 1
  ),
  mov as (
    select
      coalesce(o.tipo, m.tipo) as tipo,
      sum(case m.sentido when 'entrada' then m.valor else -m.valor end) as efeito
    from public.caixa_movimentos m
    left join public.caixa_movimentos o on o.id = m.estorna_id
    where m.sessao_id = p_sessao_id
    group by 1
  ),
  desp as (
    select
      case when cat.sistema_chave = 'comissoes_pagas' then 'comissao' else 'despesa' end as tipo,
      -sum(d.valor) as efeito
    from public.despesas d
    join public.despesa_categorias cat on cat.id = d.categoria_id
    where d.caixa_sessao_id = p_sessao_id
    group by 1
  ),
  saidas as (
    select tipo, efeito from mov where efeito <> 0
    union all
    select tipo, efeito from desp where efeito <> 0
  ),
  base as (
    select
      (select fundo_contado from public.caixa_sessoes where id = p_sessao_id) as fundo,
      coalesce((select valor from pag where forma = 'dinheiro'), 0) as dinheiro,
      coalesce((select valor from pag where forma = 'pix'), 0) as pix,
      coalesce((select valor from pag where forma = 'cartao'), 0) as cartao,
      coalesce((select troco from pag where forma = 'dinheiro'), 0) as troco,
      coalesce((select sum(efeito) from saidas), 0) as mov
  )
  select jsonb_build_object(
    'fundo', fundo,
    'comandas_dinheiro', dinheiro,
    'comandas_pix', pix,
    'comandas_cartao', cartao,
    'comandas_total', dinheiro + pix + cartao,
    'troco_dado', troco,
    'recebido_duplicatas', coalesce((select sum(posterior) from pag), 0),
    'qtd_comandas', (select count(*) from public.comandas where caixa_sessao_id = p_sessao_id),
    'movimentos', coalesce(
      (select jsonb_agg(jsonb_build_object('tipo', tipo, 'efeito', efeito) order by tipo) from saidas),
      '[]'::jsonb
    ),
    'esperado_dinheiro', fundo + dinheiro + mov,
    'esperado_cartao', cartao,
    'esperado_pix', pix
  )
  from base;
$$;

-- Saldo esperado na gaveta agora (uso interno das travas).
create function public.caixa_saldo(p_sessao_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (public.caixa_calcular(p_sessao_id)->>'esperado_dinheiro')::numeric;
$$;

-- Comandas do caixa com saldo em aberto. Não impedem o fechamento: viram
-- duplicata e o restante é recebido depois (receber_pagamento).
create function public.caixa_pendencias(p_sessao_id uuid)
returns table (comanda_id uuid, cliente_nome text, total numeric, pago numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.cliente_nome, c.total, x.pago
  from public.comandas c
  cross join lateral (
    select coalesce(sum((p->>'valor')::numeric), 0) as pago
    from jsonb_array_elements(c.pagamentos) p
  ) x
  where c.caixa_sessao_id = p_sessao_id
    and auth.uid() is not null
    and c.total - x.pago > 0.009
  order by c.created_at;
$$;

-- Resumo ao vivo: só admin (fechamento cego para os demais).
create function public.caixa_resumo(p_sessao_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem ver o resumo do caixa.';
  end if;
  return public.caixa_calcular(p_sessao_id);
end;
$$;

-- ── Travas ──────────────────────────────────────────────────────────────────

create function public.caixa_movimentos_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Lançamentos de caixa não podem ser alterados nem excluídos. Use o estorno.';
end;
$$;

create trigger caixa_movimentos_sem_update_delete
  before update or delete on public.caixa_movimentos
  for each row execute function public.caixa_movimentos_imutavel();

-- Comanda nova entra no caixa aberto (a data continua a digitada). Em comanda
-- de caixa fechado, o que o caixa soma (total, pagamentos, data) não muda mais e
-- ela não pode ser excluída — a única mudança de pagamento aceita é ACRESCENTAR
-- recebimento marcado com o caixa aberto (baixa de duplicata). Cliente pode mudar.
-- O "for share" faz a gravação esperar um fechamento em andamento terminar.
create function public.comandas_trava_caixa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao public.caixa_sessoes%rowtype;
  v_aberta text;
  v_qtd_antes integer;
  v_acrescimo boolean := false;
  v_pago numeric;
begin
  if tg_op = 'DELETE' then
    if old.caixa_sessao_id is not null then
      select * into v_sessao from public.caixa_sessoes where id = old.caixa_sessao_id for share;
      if v_sessao.status <> 'aberto' then
        raise exception 'Esta comanda é de um caixa já fechado e não pode ser excluída.';
      end if;
    end if;
    return old;
  end if;

  select id::text into v_aberta from public.caixa_sessoes where status = 'aberto' for share;

  if tg_op = 'INSERT' then
    if v_aberta is null then
      raise exception 'Abra o caixa antes de lançar comandas.';
    end if;
    new.caixa_sessao_id := v_aberta::uuid;
  else
    new.caixa_sessao_id := old.caixa_sessao_id;

    -- Acréscimo: os pagamentos antigos ficam iguais e na mesma ordem, e todo
    -- pagamento novo vem marcado com o caixa aberto agora.
    v_qtd_antes := jsonb_array_length(coalesce(old.pagamentos, '[]'::jsonb));
    if v_aberta is not null
       and new.pagamentos is distinct from old.pagamentos
       and jsonb_array_length(coalesce(new.pagamentos, '[]'::jsonb)) > v_qtd_antes then
      v_acrescimo :=
        coalesce((select jsonb_agg(e order by i)
                  from jsonb_array_elements(new.pagamentos) with ordinality t(e, i)
                  where i <= v_qtd_antes), '[]'::jsonb) = coalesce(old.pagamentos, '[]'::jsonb)
        and not exists (select 1
                        from jsonb_array_elements(new.pagamentos) with ordinality t(e, i)
                        where i > v_qtd_antes and (e->>'sessao_id') is distinct from v_aberta);
    end if;

    if old.caixa_sessao_id is not null then
      select * into v_sessao from public.caixa_sessoes where id = old.caixa_sessao_id for share;
      if v_sessao.status <> 'aberto' and (
        new.total is distinct from old.total
        or new.data is distinct from old.data
        or (new.pagamentos is distinct from old.pagamentos and not v_acrescimo)
      ) then
        raise exception 'Esta comanda é de um caixa já fechado e não pode ser alterada. Para receber o restante, use Duplicatas.';
      end if;
    end if;
  end if;

  -- Ninguém marca pagamento com um caixa que não seja o aberto (só o que já estava gravado).
  if exists (
    select 1 from jsonb_array_elements(coalesce(new.pagamentos, '[]'::jsonb)) e
    where e->>'sessao_id' is not null
      and e->>'sessao_id' is distinct from v_aberta
      and not (tg_op = 'UPDATE' and coalesce(old.pagamentos, '[]'::jsonb) @> jsonb_build_array(e))
  ) then
    raise exception 'Pagamento marcado com um caixa que não está aberto.';
  end if;

  -- Validações de pagamento: comandas do caixa e recebimentos novos (histórico
  -- fica como está).
  if new.caixa_sessao_id is not null or v_acrescimo then
    if exists (
      select 1 from jsonb_array_elements(new.pagamentos) p
      where p->>'forma' = 'dinheiro'
        and p->>'valor_recebido' is not null
        and (p->>'valor_recebido')::numeric < (p->>'valor')::numeric
    ) then
      raise exception 'O valor recebido em dinheiro é menor que o valor pago em dinheiro.';
    end if;
    select coalesce(sum((p->>'valor')::numeric), 0) into v_pago
    from jsonb_array_elements(new.pagamentos) p;
    if v_pago > new.total then
      raise exception 'Os pagamentos somam mais que o total da comanda. Se o cliente deu dinheiro a mais, use o campo "Recebido" para calcular o troco.';
    end if;
  end if;

  return new;
end;
$$;

create trigger comandas_trava_caixa
  before insert or update or delete on public.comandas
  for each row execute function public.comandas_trava_caixa();

-- Itens de comanda de caixa fechado: serviço, valor e profissional travados.
-- As colunas de pagamento de comissão continuam livres (a comissão é paga depois).
create function public.comanda_itens_trava_caixa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE'
     and new.comanda_id = old.comanda_id
     and new.servico is not distinct from old.servico
     and new.valor is not distinct from old.valor
     and new.profissional_id is not distinct from old.profissional_id then
    return new; -- só mexeu em comissão/ordem
  end if;

  select s.status into v_status
  from public.comandas c
  join public.caixa_sessoes s on s.id = c.caixa_sessao_id
  where c.id = case when tg_op = 'DELETE' then old.comanda_id else new.comanda_id end
  for share of s;

  if found and v_status <> 'aberto' then
    raise exception 'Esta comanda é de um caixa já fechado e não pode ser alterada.';
  end if;

  if tg_op = 'UPDATE' and new.comanda_id <> old.comanda_id then
    raise exception 'Não é permitido mover itens entre comandas.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger comanda_itens_trava_caixa
  before insert or update or delete on public.comanda_itens
  for each row execute function public.comanda_itens_trava_caixa();

-- Despesa paga com dinheiro da gaveta: só no caixa aberto, só dinheiro já pago,
-- e não pode passar do que tem na gaveta. Depois do fechamento, valor/forma/
-- status/data travam e ela não pode ser excluída.
create function public.despesas_trava_caixa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao public.caixa_sessoes%rowtype;
  v_saldo numeric;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.caixa_sessao_id is not null then
    select * into v_sessao from public.caixa_sessoes where id = old.caixa_sessao_id for share;
    if v_sessao.status <> 'aberto' and (
      tg_op = 'DELETE'
      or new.valor is distinct from old.valor
      or new.forma_pagamento is distinct from old.forma_pagamento
      or new.status is distinct from old.status
      or new.data is distinct from old.data
      or new.caixa_sessao_id is distinct from old.caixa_sessao_id
    ) then
      raise exception 'Esta despesa saiu de um caixa já fechado e não pode ser alterada.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.caixa_sessao_id is not null
     and (tg_op = 'INSERT'
          or new.caixa_sessao_id is distinct from old.caixa_sessao_id
          or new.valor is distinct from old.valor) then
    -- for update: serializa saídas concorrentes e espera um fechamento em andamento.
    select * into v_sessao from public.caixa_sessoes
    where id = new.caixa_sessao_id and status = 'aberto' for update;
    if not found then
      raise exception 'O caixa dessa despesa não está aberto.';
    end if;
    if new.forma_pagamento is distinct from 'dinheiro' or new.status <> 'pago' then
      raise exception 'Só despesa já paga em dinheiro pode sair do caixa.';
    end if;

    v_saldo := public.caixa_saldo(new.caixa_sessao_id);
    if tg_op = 'UPDATE' and old.caixa_sessao_id = new.caixa_sessao_id then
      v_saldo := v_saldo + old.valor; -- o valor antigo já estava descontado
    end if;
    if new.valor > v_saldo then
      raise exception 'Não há dinheiro suficiente no caixa para essa despesa.';
    end if;

    new.data := v_sessao.data_operacional;
    new.data_pagamento := v_sessao.data_operacional;
  elsif new.caixa_sessao_id is not null
        and (new.forma_pagamento is distinct from 'dinheiro' or new.status <> 'pago') then
    raise exception 'Só despesa já paga em dinheiro pode sair do caixa.';
  end if;

  return new;
end;
$$;

create trigger despesas_trava_caixa
  before insert or update or delete on public.despesas
  for each row execute function public.despesas_trava_caixa();

-- ── Operações ───────────────────────────────────────────────────────────────

create function public.abrir_caixa(
  p_fundo_contado numeric,
  p_cedulas jsonb,
  p_justificativa text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_anterior public.caixa_sessoes%rowtype;
  v_fundo_esperado numeric(10, 2) := round(p_fundo_contado, 2); -- 1º caixa: nada a comparar
  v_justificativa text := nullif(trim(coalesce(p_justificativa, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sessão expirada, faça login novamente.';
  end if;
  if p_fundo_contado is null or p_fundo_contado < 0 then
    raise exception 'Informe o valor contado na gaveta.';
  end if;
  if exists (select 1 from public.caixa_sessoes where status = 'aberto') then
    raise exception 'Já existe um caixa aberto.';
  end if;

  select * into v_anterior
  from public.caixa_sessoes
  where status <> 'aberto'
  order by fechado_em desc
  limit 1;

  if found then
    v_fundo_esperado := coalesce(v_anterior.fundo_deixado, 0);
    if round(p_fundo_contado, 2) <> v_fundo_esperado and v_justificativa is null then
      raise exception 'O valor contado é diferente do que ficou no último fechamento (R$ %). Informe o motivo.',
        replace(to_char(v_fundo_esperado, 'FM999999990.00'), '.', ',');
    end if;
  end if;

  insert into public.caixa_sessoes (aberto_por, fundo_esperado, fundo_contado, fundo_cedulas, justificativa_abertura)
  values (v_uid, v_fundo_esperado, round(p_fundo_contado, 2), p_cedulas, v_justificativa)
  returning id into v_id;

  insert into public.caixa_eventos (sessao_id, evento, motivo, feito_por)
  values (v_id, 'abertura', v_justificativa, v_uid);

  return v_id;
end;
$$;

-- Recebe (todo ou parte) o saldo em aberto de uma comanda — baixa de duplicata.
-- Acrescenta um pagamento marcado com o caixa aberto agora; nada do que já foi
-- gravado muda. Vale para comanda de caixa fechado e para comanda antiga.
create function public.receber_pagamento(
  p_comanda_id uuid,
  p_forma text,
  p_valor numeric,
  p_tipo_cartao text,
  p_parcelas integer,
  p_valor_recebido numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sessao public.caixa_sessoes%rowtype;
  v_comanda public.comandas%rowtype;
  v_valor numeric(10, 2) := round(p_valor, 2);
  v_recebido numeric(10, 2) := round(p_valor_recebido, 2);
  v_saldo numeric;
begin
  if v_uid is null then
    raise exception 'Sessão expirada, faça login novamente.';
  end if;
  if p_forma is null or p_forma not in ('dinheiro', 'pix', 'cartao') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_forma = 'cartao' and coalesce(p_tipo_cartao, '') not in ('debito', 'credito') then
    raise exception 'Selecione Débito ou Crédito para o pagamento no cartão.';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;
  if p_forma = 'dinheiro' and v_recebido is not null and v_recebido < v_valor then
    raise exception 'O valor recebido em dinheiro é menor que o valor pago em dinheiro.';
  end if;

  select * into v_sessao from public.caixa_sessoes where status = 'aberto' for share;
  if not found then
    raise exception 'Abra o caixa antes de receber pagamentos.';
  end if;

  select * into v_comanda from public.comandas where id = p_comanda_id for update;
  if not found then
    raise exception 'Comanda não encontrada.';
  end if;

  select v_comanda.total - coalesce(sum((p->>'valor')::numeric), 0) into v_saldo
  from jsonb_array_elements(coalesce(v_comanda.pagamentos, '[]'::jsonb)) p;
  if v_valor > v_saldo + 0.009 then
    raise exception 'O valor é maior que o saldo em aberto da comanda (R$ %).',
      replace(to_char(greatest(v_saldo, 0), 'FM999999990.00'), '.', ',');
  end if;

  update public.comandas
  set pagamentos = coalesce(pagamentos, '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'forma', p_forma,
        'valor', v_valor,
        'parcelas', case when p_forma = 'cartao' and p_tipo_cartao = 'credito' then p_parcelas end,
        'tipo_cartao', case when p_forma = 'cartao' then p_tipo_cartao end,
        'valor_recebido', case when p_forma = 'dinheiro' then v_recebido end,
        'sessao_id', v_sessao.id,
        'recebido_em', now(),
        'recebido_por', v_uid
      ))),
      updated_at = now()
  where id = p_comanda_id;
end;
$$;

create function public.lancar_movimento(
  p_tipo text,
  p_valor numeric,
  p_descricao text,
  p_sentido text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sessao public.caixa_sessoes%rowtype;
  v_sentido text;
  v_valor numeric(10, 2) := round(p_valor, 2);
  v_descricao text := nullif(trim(coalesce(p_descricao, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sessão expirada, faça login novamente.';
  end if;

  if p_tipo = 'suprimento' then
    v_sentido := 'entrada';
  elsif p_tipo in ('sangria', 'ajuste') then
    if not public.is_admin() then
      raise exception 'Apenas administradores podem lançar sangria ou ajuste.';
    end if;
    v_sentido := case when p_tipo = 'sangria' then 'saida' else p_sentido end;
  else
    raise exception 'Tipo de lançamento inválido.';
  end if;

  if v_sentido is null or v_sentido not in ('entrada', 'saida') then
    raise exception 'Informe se o ajuste é entrada ou saída.';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;
  if v_descricao is null then
    raise exception 'Informe a descrição do lançamento.';
  end if;

  select * into v_sessao from public.caixa_sessoes where status = 'aberto' for update;
  if not found then
    raise exception 'Nenhum caixa aberto.';
  end if;

  if v_sentido = 'saida' and v_valor > public.caixa_saldo(v_sessao.id) then
    raise exception 'Não há dinheiro suficiente no caixa para essa saída.';
  end if;

  insert into public.caixa_movimentos (sessao_id, tipo, sentido, valor, descricao, criado_por)
  values (v_sessao.id, p_tipo, v_sentido, v_valor, v_descricao, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

create function public.estornar_movimento(p_movimento_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_original public.caixa_movimentos%rowtype;
  v_sessao public.caixa_sessoes%rowtype;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem estornar lançamentos.';
  end if;
  if v_motivo is null then
    raise exception 'Informe o motivo do estorno.';
  end if;

  select * into v_sessao from public.caixa_sessoes where status = 'aberto' for update;
  if not found then
    raise exception 'Nenhum caixa aberto.';
  end if;

  select * into v_original from public.caixa_movimentos where id = p_movimento_id;
  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  if v_original.sessao_id <> v_sessao.id then
    raise exception 'Só é possível estornar lançamentos do caixa aberto. Para corrigir um caixa anterior, lance um ajuste.';
  end if;
  if v_original.tipo = 'estorno' then
    raise exception 'Não é possível estornar um estorno.';
  end if;
  if exists (select 1 from public.caixa_movimentos where estorna_id = v_original.id) then
    raise exception 'Esse lançamento já foi estornado.';
  end if;
  if v_original.sentido = 'entrada' and v_original.valor > public.caixa_saldo(v_sessao.id) then
    raise exception 'Não há dinheiro suficiente no caixa para esse estorno.';
  end if;

  insert into public.caixa_movimentos (sessao_id, tipo, sentido, valor, descricao, estorna_id, criado_por)
  values (
    v_sessao.id, 'estorno',
    case v_original.sentido when 'entrada' then 'saida' else 'entrada' end,
    v_original.valor, v_motivo, v_original.id, v_uid
  )
  returning id into v_id;

  return v_id;
end;
$$;

create function public.fechar_caixa(
  p_contado_dinheiro numeric,
  p_cedulas jsonb,
  p_informado_cartao numeric,
  p_informado_pix numeric,
  p_fundo_deixado numeric,
  p_observacao text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sessao public.caixa_sessoes%rowtype;
  v_calc jsonb;
  v_contado numeric(10, 2) := round(p_contado_dinheiro, 2);
  v_cartao numeric(10, 2) := round(p_informado_cartao, 2);
  v_pix numeric(10, 2) := round(p_informado_pix, 2);
  v_fundo numeric(10, 2) := round(p_fundo_deixado, 2);
begin
  if v_uid is null then
    raise exception 'Sessão expirada, faça login novamente.';
  end if;
  if v_contado is null or v_contado < 0 then
    raise exception 'Informe o dinheiro contado na gaveta.';
  end if;
  if v_cartao is null or v_cartao < 0 or v_pix is null or v_pix < 0 then
    raise exception 'Informe os totais de cartão e Pix (use 0 se não houve).';
  end if;
  if v_fundo is null or v_fundo < 0 or v_fundo > v_contado then
    raise exception 'O fundo que fica na gaveta precisa ser entre zero e o valor contado.';
  end if;

  -- for update: comandas/despesas/lançamentos novos esperam este fechamento e depois são recusados.
  select * into v_sessao from public.caixa_sessoes where status = 'aberto' for update;
  if not found then
    raise exception 'Nenhum caixa aberto.';
  end if;

  v_calc := public.caixa_calcular(v_sessao.id);

  insert into public.caixa_apuracoes (
    sessao_id, esperado_dinheiro, esperado_cartao, esperado_pix,
    diferenca_dinheiro, diferenca_cartao, diferenca_pix, detalhe
  ) values (
    v_sessao.id,
    (v_calc->>'esperado_dinheiro')::numeric,
    (v_calc->>'esperado_cartao')::numeric,
    (v_calc->>'esperado_pix')::numeric,
    v_contado - (v_calc->>'esperado_dinheiro')::numeric,
    v_cartao - (v_calc->>'esperado_cartao')::numeric,
    v_pix - (v_calc->>'esperado_pix')::numeric,
    v_calc
  );

  update public.caixa_sessoes
  set status = 'fechado',
      fechado_por = v_uid,
      fechado_em = now(),
      contado_dinheiro = v_contado,
      contado_cedulas = p_cedulas,
      informado_cartao = v_cartao,
      informado_pix = v_pix,
      fundo_deixado = v_fundo,
      observacao_fechamento = nullif(trim(coalesce(p_observacao, '')), '')
  where id = v_sessao.id;

  insert into public.caixa_eventos (sessao_id, evento, motivo, feito_por)
  values (v_sessao.id, 'fechamento', nullif(trim(coalesce(p_observacao, '')), ''), v_uid);

  return v_sessao.id;
end;
$$;

create function public.conferir_caixa(p_sessao_id uuid, p_observacao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sessao public.caixa_sessoes%rowtype;
  v_apuracao public.caixa_apuracoes%rowtype;
  v_obs text := nullif(trim(coalesce(p_observacao, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem conferir o caixa.';
  end if;

  select * into v_sessao from public.caixa_sessoes where id = p_sessao_id for update;
  if not found or v_sessao.status <> 'fechado' then
    raise exception 'Só é possível conferir um caixa fechado.';
  end if;

  select * into v_apuracao from public.caixa_apuracoes where sessao_id = p_sessao_id;
  if (v_apuracao.diferenca_dinheiro <> 0 or v_apuracao.diferenca_cartao <> 0
      or v_apuracao.diferenca_pix <> 0 or v_sessao.fundo_contado <> v_sessao.fundo_esperado)
     and v_obs is null then
    raise exception 'Há diferença neste caixa. Escreva uma observação explicando antes de conferir.';
  end if;

  update public.caixa_sessoes
  set status = 'conferido', conferido_por = v_uid, conferido_em = now(), observacao_conferencia = v_obs
  where id = p_sessao_id;

  insert into public.caixa_eventos (sessao_id, evento, motivo, feito_por)
  values (p_sessao_id, 'conferencia', v_obs, v_uid);
end;
$$;

-- Reabrir só o último caixa, ainda não conferido, sem outro aberto.
-- A apuração anterior fica guardada no log.
create function public.reabrir_caixa(p_sessao_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sessao public.caixa_sessoes%rowtype;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem reabrir o caixa.';
  end if;
  if v_motivo is null then
    raise exception 'Informe o motivo da reabertura.';
  end if;

  select * into v_sessao from public.caixa_sessoes where id = p_sessao_id for update;
  if not found or v_sessao.status <> 'fechado' then
    raise exception 'Só é possível reabrir um caixa fechado e ainda não conferido.';
  end if;
  if exists (select 1 from public.caixa_sessoes where status = 'aberto') then
    raise exception 'Feche o caixa atual antes de reabrir um anterior.';
  end if;
  if exists (select 1 from public.caixa_sessoes where aberto_em > v_sessao.aberto_em) then
    raise exception 'Só o último caixa pode ser reaberto. Para corrigir, lance um ajuste no caixa atual.';
  end if;

  insert into public.caixa_eventos (sessao_id, evento, motivo, detalhe, feito_por)
  values (
    p_sessao_id, 'reabertura', v_motivo,
    jsonb_build_object(
      'sessao', to_jsonb(v_sessao),
      'apuracao', (select to_jsonb(a) from public.caixa_apuracoes a where a.sessao_id = p_sessao_id)
    ),
    v_uid
  );

  delete from public.caixa_apuracoes where sessao_id = p_sessao_id;

  update public.caixa_sessoes
  set status = 'aberto',
      fechado_por = null, fechado_em = null,
      contado_dinheiro = null, contado_cedulas = null,
      informado_cartao = null, informado_pix = null,
      fundo_deixado = null, observacao_fechamento = null
  where id = p_sessao_id;
end;
$$;

-- ── Permissões das funções ──────────────────────────────────────────────────
revoke execute on function public.caixa_calcular(uuid) from public, anon, authenticated;
revoke execute on function public.caixa_saldo(uuid) from public, anon, authenticated;

revoke execute on function public.caixa_pendencias(uuid) from public, anon;
revoke execute on function public.caixa_resumo(uuid) from public, anon;
revoke execute on function public.abrir_caixa(numeric, jsonb, text) from public, anon;
revoke execute on function public.receber_pagamento(uuid, text, numeric, text, integer, numeric) from public, anon;
revoke execute on function public.lancar_movimento(text, numeric, text, text) from public, anon;
revoke execute on function public.estornar_movimento(uuid, text) from public, anon;
revoke execute on function public.fechar_caixa(numeric, jsonb, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.conferir_caixa(uuid, text) from public, anon;
revoke execute on function public.reabrir_caixa(uuid, text) from public, anon;

grant execute on function public.caixa_pendencias(uuid) to authenticated;
grant execute on function public.caixa_resumo(uuid) to authenticated;
grant execute on function public.abrir_caixa(numeric, jsonb, text) to authenticated;
grant execute on function public.receber_pagamento(uuid, text, numeric, text, integer, numeric) to authenticated;
grant execute on function public.lancar_movimento(text, numeric, text, text) to authenticated;
grant execute on function public.estornar_movimento(uuid, text) to authenticated;
grant execute on function public.fechar_caixa(numeric, jsonb, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.conferir_caixa(uuid, text) to authenticated;
grant execute on function public.reabrir_caixa(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
