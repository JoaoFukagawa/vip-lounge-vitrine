-- Agenda: agendamentos, transferências entre profissionais e dados de horário/especialidade no profile.
-- Necessário para o índice de exclusão (impede dois agendamentos sobrepostos pro mesmo profissional).
create extension if not exists btree_gist;

-- ── Profiles: dados de trabalho do profissional ────────────────────────────
alter table public.profiles
  add column especialidades text[] not null default '{}',
  add column dias_trabalho smallint[] not null default '{1,2,3,4,5,6}', -- 0=dom .. 6=sáb
  add column horario_inicio time not null default '09:00',
  add column horario_fim time not null default '19:00',
  add column ativo boolean not null default true,
  add column desativado_em timestamptz;

-- Admin passa a poder editar qualquer profile (horário, especialidades, ativo/inativo).
-- A policy de self-update (profiles_update_self) continua valendo pro próprio nome.
create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (true);

-- ── Serviços: duração padrão (usada para pré-preencher o agendamento) ──────
alter table public.servicos
  add column duracao_minutos smallint not null default 60;

-- ── Agendamentos ────────────────────────────────────────────────────────────
create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),

  data date not null,
  hora_inicio time not null,
  duracao_minutos smallint not null default 60 check (duracao_minutos > 0 and duracao_minutos <= 480),
  -- hora_fim e periodo são preenchidos pelo trigger agendamentos_compute_periodo abaixo
  -- (não usamos "generated always as" aqui porque o Postgres exige expressão immutable,
  -- e a combinação date+time+interval cast não passa nessa checagem).
  hora_fim time,

  cliente_nome text not null,
  cliente_contato text,

  profissional_id uuid not null references public.profiles(id),
  servico_id uuid references public.servicos(id),

  status text not null default 'agendado'
    check (status in ('agendado', 'concluido', 'cancelado', 'nao_compareceu')),

  observacoes text,
  motivo_cancelamento text,

  -- Preenchido quando o agendamento vira uma comanda de fato (atendimento realizado).
  comanda_id uuid references public.comandas(id) on delete set null,

  -- Faixa de tempo local (sem timezone), usada só pra impedir sobreposição — não é exposta pra app.
  periodo tsrange,

  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Impede dois agendamentos ativos sobrepostos pro mesmo profissional (nível banco, sem race condition).
  exclude using gist (
    profissional_id with =,
    periodo with &&
  ) where (status not in ('cancelado', 'nao_compareceu'))
);

alter table public.agendamentos enable row level security;

create policy "agendamentos_select_authenticated"
  on public.agendamentos for select
  to authenticated
  using (true);

create policy "agendamentos_insert_authenticated"
  on public.agendamentos for insert
  to authenticated
  with check (true);

create policy "agendamentos_update_authenticated"
  on public.agendamentos for update
  to authenticated
  using (true)
  with check (true);

create policy "agendamentos_delete_authenticated"
  on public.agendamentos for delete
  to authenticated
  using (true);

create index agendamentos_data_idx on public.agendamentos(data);
create index agendamentos_profissional_data_idx on public.agendamentos(profissional_id, data);
create index agendamentos_status_idx on public.agendamentos(status);

-- Calcula hora_fim e periodo a cada insert/update (roda antes da constraint EXCLUDE acima).
create function public.agendamentos_compute_periodo()
returns trigger
language plpgsql
as $$
begin
  new.hora_fim := new.hora_inicio + (new.duracao_minutos || ' minutes')::interval;
  new.periodo := tsrange(
    new.data + new.hora_inicio,
    new.data + new.hora_inicio + (new.duracao_minutos || ' minutes')::interval
  );
  return new;
end;
$$;

create trigger agendamentos_before_write
  before insert or update on public.agendamentos
  for each row execute function public.agendamentos_compute_periodo();

-- ── Histórico de transferências (auditoria: quem tirou, quem recebeu, por quê) ─
create table public.agendamento_transferencias (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  profissional_anterior_id uuid not null references public.profiles(id),
  profissional_novo_id uuid not null references public.profiles(id),
  motivo text,
  transferido_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.agendamento_transferencias enable row level security;

create policy "agendamento_transferencias_select_authenticated"
  on public.agendamento_transferencias for select
  to authenticated
  using (true);

create policy "agendamento_transferencias_insert_authenticated"
  on public.agendamento_transferencias for insert
  to authenticated
  with check (true);

create index agendamento_transferencias_agendamento_idx on public.agendamento_transferencias(agendamento_id);

-- ── updated_at automático ───────────────────────────────────────────────────
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agendamentos_set_updated_at
  before update on public.agendamentos
  for each row execute function public.set_updated_at();
