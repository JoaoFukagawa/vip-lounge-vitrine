-- Serviços do salão, com comissão configurável por serviço
create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  comissao_percentual numeric(5, 2) not null default 30,
  ativo boolean not null default true,
  ordem smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.servicos enable row level security;

create policy "servicos_select_authenticated"
  on public.servicos for select
  to authenticated
  using (true);

-- Só administradores criam/editam/excluem serviços
create policy "servicos_admin_write"
  on public.servicos for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Migra a lista fixa que já existia, com as comissões usadas até agora
insert into public.servicos (nome, comissao_percentual, ordem) values
  ('Lavagem', 30, 0),
  ('Corte', 30, 1),
  ('Escova', 30, 2),
  ('Coloração', 30, 3),
  ('Mechas', 30, 4),
  ('Progressiva', 30, 5),
  ('Cauterização', 30, 6),
  ('Hidratação', 30, 7),
  ('Blindagem', 30, 8),
  ('Penteado', 30, 9),
  ('Maquiagem', 30, 10),
  ('Sobrancelha', 30, 11),
  ('Sobrancelha Henna', 30, 12),
  ('Micropigmentação Sob.', 30, 13),
  ('Along. Cílios', 30, 14),
  ('Dep. Facial', 30, 15),
  ('Pé', 20, 16),
  ('Mão', 20, 17),
  ('Esmaltação Gel', 30, 18);
