-- Troca o horário único (dias_trabalho + horario_inicio/fim em profiles) por um
-- horário configurável por dia da semana — sábado pode ter hora diferente de terça, etc.

create table public.profissional_horarios (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profiles(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0=dom .. 6=sáb
  horario_inicio time not null,
  horario_fim time not null,
  unique (profissional_id, dia_semana),
  check (horario_inicio < horario_fim)
);

alter table public.profissional_horarios enable row level security;

create policy "profissional_horarios_select_authenticated"
  on public.profissional_horarios for select
  to authenticated
  using (true);

-- Só admin edita a grade de horários (mesma regra de quem edita o profile).
create policy "profissional_horarios_admin_write"
  on public.profissional_horarios for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index profissional_horarios_profissional_idx on public.profissional_horarios(profissional_id);

-- Migra os dados existentes: um registro por dia que já estava marcado em dias_trabalho.
insert into public.profissional_horarios (profissional_id, dia_semana, horario_inicio, horario_fim)
select p.id, dia, p.horario_inicio, p.horario_fim
from public.profiles p, unnest(p.dias_trabalho) as dia
where p.horario_inicio < p.horario_fim
on conflict (profissional_id, dia_semana) do nothing;

alter table public.profiles
  drop column dias_trabalho,
  drop column horario_inicio,
  drop column horario_fim;

-- ── Agenda passa a respeitar o horário do dia específico ────────────────────
create function public.agendamentos_valida_horario_trabalho()
returns trigger
language plpgsql
as $$
declare
  dia smallint;
  horario public.profissional_horarios%rowtype;
  fim_atendimento time;
begin
  -- Cancelado/não compareceu não precisa mais bater com a grade de horários.
  if new.status in ('cancelado', 'nao_compareceu') then
    return new;
  end if;

  dia := extract(dow from new.data);
  fim_atendimento := new.hora_inicio + (new.duracao_minutos || ' minutes')::interval;

  select * into horario
  from public.profissional_horarios
  where profissional_id = new.profissional_id and dia_semana = dia;

  if not found then
    raise exception 'Esse profissional não trabalha neste dia da semana.';
  end if;

  if new.hora_inicio < horario.horario_inicio or fim_atendimento > horario.horario_fim then
    raise exception 'Fora do horário de trabalho do profissional nesse dia (% às %).',
      to_char(horario.horario_inicio, 'HH24:MI'), to_char(horario.horario_fim, 'HH24:MI');
  end if;

  return new;
end;
$$;

create trigger agendamentos_valida_horario
  before insert or update on public.agendamentos
  for each row execute function public.agendamentos_valida_horario_trabalho();
