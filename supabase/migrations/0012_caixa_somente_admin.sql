-- Caixa só para administradores: abrir, lançar (suprimento, sangria, ajuste),
-- tirar dinheiro da gaveta (despesa ligada ao caixa) e fechar. As demais
-- usuárias continuam lançando comandas e recebendo duplicatas no caixa que a
-- administração abriu. Estorno, conferência e reabertura já eram só admin.
-- Só redefine funções — não toca em nenhum dado.

begin;

create or replace function public.despesas_trava_caixa()
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
    if not public.is_admin() then
      raise exception 'Apenas administradores podem tirar dinheiro do caixa.';
    end if;
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

create or replace function public.abrir_caixa(
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
  if not public.is_admin() then
    raise exception 'Apenas administradores podem abrir o caixa.';
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

create or replace function public.lancar_movimento(
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

  if not public.is_admin() then
    raise exception 'Apenas administradores podem lançar no caixa.';
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

create or replace function public.fechar_caixa(
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
  if not public.is_admin() then
    raise exception 'Apenas administradores podem fechar o caixa.';
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

notify pgrst, 'reload schema';

commit;
