-- Tabela de clientes de verdade, com identidade própria (id), pra sustentar
-- a busca/autocomplete na comanda e no agendamento sem depender do nome digitado.
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contato text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clientes enable row level security;

create policy "clientes_select_authenticated"
  on public.clientes for select
  to authenticated
  using (true);

create policy "clientes_insert_authenticated"
  on public.clientes for insert
  to authenticated
  with check (true);

create policy "clientes_update_authenticated"
  on public.clientes for update
  to authenticated
  using (true)
  with check (true);

-- Busca por nome (ilike) usa esse índice.
create index clientes_nome_idx on public.clientes (lower(nome));

-- Recria em vez de assumir que a 0004 já rodou nesse banco — create or replace
-- é seguro mesmo se a função já existir.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clientes_set_updated_at
  before update on public.clientes
  for each row execute function public.set_updated_at();

-- Vínculo opcional — os campos de texto (cliente_nome/cliente_contato) continuam
-- existindo em comandas e agendamentos, pra não quebrar nada já lançado.
-- Lançamentos antigos ficam com cliente_id nulo; novos, feitos pelo autocomplete,
-- preenchem os dois.
alter table public.comandas
  add column cliente_id uuid references public.clientes(id) on delete set null;

alter table public.agendamentos
  add column cliente_id uuid references public.clientes(id) on delete set null;

create index comandas_cliente_id_idx on public.comandas(cliente_id);
create index agendamentos_cliente_id_idx on public.agendamentos(cliente_id);
