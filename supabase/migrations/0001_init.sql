-- Perfis dos usuários (um por profissional/admin), espelha auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Todo usuário autenticado pode ver a lista de profissionais (para preencher os selects da comanda)
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Usuário só edita o próprio nome
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Cria o profile automaticamente quando um usuário é criado (via admin API)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Comandas (a ficha de atendimento)
create table public.comandas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  cliente_nome text,
  cliente_contato text,
  forma_pagamento text check (forma_pagamento in ('cartao', 'dinheiro', 'pix')),
  parcelas smallint,
  total numeric(10, 2) not null default 0,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comandas enable row level security;

create policy "comandas_select_authenticated"
  on public.comandas for select
  to authenticated
  using (true);

create policy "comandas_insert_authenticated"
  on public.comandas for insert
  to authenticated
  with check (true);

create policy "comandas_update_authenticated"
  on public.comandas for update
  to authenticated
  using (true)
  with check (true);

create policy "comandas_delete_authenticated"
  on public.comandas for delete
  to authenticated
  using (true);

-- Itens de serviço dentro de cada comanda (linha da tabela: serviço, profissional, valor)
create table public.comanda_itens (
  id uuid primary key default gen_random_uuid(),
  comanda_id uuid not null references public.comandas(id) on delete cascade,
  servico text not null,
  profissional_id uuid references public.profiles(id),
  valor numeric(10, 2) not null default 0,
  ordem smallint not null default 0
);

alter table public.comanda_itens enable row level security;

create policy "comanda_itens_select_authenticated"
  on public.comanda_itens for select
  to authenticated
  using (true);

create policy "comanda_itens_insert_authenticated"
  on public.comanda_itens for insert
  to authenticated
  with check (true);

create policy "comanda_itens_update_authenticated"
  on public.comanda_itens for update
  to authenticated
  using (true)
  with check (true);

create policy "comanda_itens_delete_authenticated"
  on public.comanda_itens for delete
  to authenticated
  using (true);

create index comanda_itens_comanda_id_idx on public.comanda_itens(comanda_id);
create index comandas_data_idx on public.comandas(data desc);
