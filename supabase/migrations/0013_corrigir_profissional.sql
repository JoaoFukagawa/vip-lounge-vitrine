-- Permite à administração corrigir a PROFISSIONAL de um serviço de comanda de
-- caixa já fechado. Trocar a profissional não mexe em nenhum valor do caixa
-- (total, pagamentos e valor do serviço continuam travados) — só muda de quem
-- é a comissão. Em caixa aberto continua livre para todos, como antes.
-- Só redefine uma função — não toca em nenhum dado.

begin;

create or replace function public.comanda_itens_trava_caixa()
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
     and new.valor is not distinct from old.valor then
    if new.profissional_id is distinct from old.profissional_id then
      select s.status into v_status
      from public.comandas c
      join public.caixa_sessoes s on s.id = c.caixa_sessao_id
      where c.id = new.comanda_id;
      if found and v_status <> 'aberto' and not public.is_admin() then
        raise exception 'Só a administração pode trocar a profissional de uma comanda de caixa já fechado.';
      end if;
    end if;
    return new; -- só mexeu em profissional, comissão ou ordem
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

notify pgrst, 'reload schema';

commit;
