-- Taxas de máquina de cartão (débito/crédito), editáveis pelo admin,
-- usadas pra descontar proporcionalmente da comissão nas vendas no cartão.
create table public.taxas_cartao (
  tipo text primary key check (tipo in ('debito', 'credito')),
  taxa_percentual numeric(5, 2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.taxas_cartao enable row level security;

create policy "taxas_cartao_select_authenticated"
  on public.taxas_cartao for select
  to authenticated
  using (true);

-- Só admin edita as taxas (mesma regra de serviços/horários).
create policy "taxas_cartao_admin_write"
  on public.taxas_cartao for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

insert into public.taxas_cartao (tipo, taxa_percentual) values
  ('debito', 1.5),
  ('credito', 3.5);

-- Reaproveita a função set_updated_at() criada na migration 0004.
create trigger taxas_cartao_set_updated_at
  before update on public.taxas_cartao
  for each row execute function public.set_updated_at();
