-- Módulo financeiro: despesas (saídas), agrupadas por categoria, com controle
-- de pago/a pagar. Também prepara o esquema pra o rastreio de comissão paga
-- por item de comanda (opção A: cada item vira uma "pendência" no momento em
-- que a comanda é fechada, e a dona marca como paga depois).

-- 1) Grupos de despesa. Fixos na aplicação; a dona edita/adiciona categoria
--    dentro dos grupos, não os grupos em si.
create table public.despesa_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem smallint not null default 0
);

alter table public.despesa_grupos enable row level security;

create policy "despesa_grupos_select_authenticated"
  on public.despesa_grupos for select
  to authenticated
  using (true);

-- 2) Categorias de despesa. A dona pode adicionar/renomear/desativar.
--    `sistema_chave` marca linhas que a aplicação depende (ex: 'comissoes_pagas'
--    é usada pelo botão "Registrar pagamento" das comissões). Essas não podem
--    ser excluídas do UI, mas podem ser renomeadas.
create table public.despesa_categorias (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.despesa_grupos(id) on delete restrict,
  nome text not null,
  ativa boolean not null default true,
  sistema_chave text unique,
  ordem smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (grupo_id, nome)
);

alter table public.despesa_categorias enable row level security;

create policy "despesa_categorias_select_authenticated"
  on public.despesa_categorias for select
  to authenticated
  using (true);

create policy "despesa_categorias_insert_authenticated"
  on public.despesa_categorias for insert
  to authenticated
  with check (true);

create policy "despesa_categorias_update_authenticated"
  on public.despesa_categorias for update
  to authenticated
  using (true)
  with check (true);

create policy "despesa_categorias_delete_authenticated"
  on public.despesa_categorias for delete
  to authenticated
  using (true);

-- 3) Despesas. Cada lançamento tem categoria, valor, status pago/a pagar e
--    (opcional) data de vencimento pra caso o dono lance boleto antes de pagar.
create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  categoria_id uuid not null references public.despesa_categorias(id) on delete restrict,
  descricao text not null,
  fornecedor text,
  valor numeric(10, 2) not null check (valor >= 0),
  forma_pagamento text check (
    forma_pagamento in ('dinheiro', 'pix', 'debito', 'credito', 'boleto', 'transferencia', 'outro')
  ),
  status text not null default 'pago' check (status in ('pago', 'a_pagar')),
  data_vencimento date,
  data_pagamento date,
  observacoes text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.despesas enable row level security;

create policy "despesas_select_authenticated"
  on public.despesas for select
  to authenticated
  using (true);

create policy "despesas_insert_authenticated"
  on public.despesas for insert
  to authenticated
  with check (true);

create policy "despesas_update_authenticated"
  on public.despesas for update
  to authenticated
  using (true)
  with check (true);

create policy "despesas_delete_authenticated"
  on public.despesas for delete
  to authenticated
  using (true);

create index despesas_data_idx on public.despesas (data desc);
create index despesas_categoria_id_idx on public.despesas (categoria_id);
create index despesas_status_idx on public.despesas (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger despesas_set_updated_at
  before update on public.despesas
  for each row execute function public.set_updated_at();

-- 4) Status de pagamento de comissão em cada item da comanda.
--    Quando `comissao_pago_em` é nulo, a comissão está pendente.
--    `comissao_valor_pago` é um snapshot do valor no momento do pagamento —
--    evita distorção caso a comanda seja editada depois. `comissao_despesa_id`
--    liga o item à despesa criada quando o pagamento foi registrado.
alter table public.comanda_itens
  add column comissao_pago_em timestamptz,
  add column comissao_valor_pago numeric(10, 2),
  add column comissao_despesa_id uuid references public.despesas(id) on delete set null;

create index comanda_itens_comissao_pendente_idx
  on public.comanda_itens (profissional_id)
  where comissao_pago_em is null;

-- 5) Backfill: itens antigos são considerados "já pagos" (a dona pagava as
--    profissionais na mão antes desse módulo existir). Isso evita mostrar uma
--    lista gigante de pendências históricas assim que a feature entrar no ar.
--    Sem despesa vinculada e sem snapshot de valor — só marca como fora do
--    fluxo de pendências.
update public.comanda_itens ci
set comissao_pago_em = c.created_at
from public.comandas c
where ci.comanda_id = c.id
  and ci.comissao_pago_em is null;

-- 6) Seed dos grupos e categorias essenciais. A dona pode editar/desativar
--    depois pela tela de admin.
insert into public.despesa_grupos (nome, ordem) values
  ('Fixas do salão', 10),
  ('Produtos e materiais', 20),
  ('Pessoal', 30),
  ('Impostos e taxas', 40),
  ('Operação e crescimento', 50),
  ('Outros', 60);

insert into public.despesa_categorias (grupo_id, nome, ordem, sistema_chave)
select g.id, cat.nome, cat.ordem, cat.chave
from public.despesa_grupos g
join (values
  ('Fixas do salão',           'Aluguel',                              10, null),
  ('Fixas do salão',           'Energia elétrica',                     20, null),
  ('Fixas do salão',           'Água',                                 30, null),
  ('Fixas do salão',           'Internet e telefone',                  40, null),
  ('Fixas do salão',           'Condomínio e IPTU',                    50, null),
  ('Fixas do salão',           'Sistema e software',                   60, null),
  ('Fixas do salão',           'Contador',                             70, null),
  ('Produtos e materiais',     'Produtos de cabelo',                   10, null),
  ('Produtos e materiais',     'Produtos de estética',                 20, null),
  ('Produtos e materiais',     'Descartáveis',                         30, null),
  ('Produtos e materiais',     'Material de limpeza',                  40, null),
  ('Produtos e materiais',     'Uniformes',                            50, null),
  ('Pessoal',                  'Comissões pagas às profissionais',     10, 'comissoes_pagas'),
  ('Pessoal',                  'Salário fixo',                         20, null),
  ('Pessoal',                  'Pró-labore',                           30, null),
  ('Pessoal',                  'Vale-transporte e benefícios',         40, null),
  ('Pessoal',                  'Encargos (INSS, FGTS)',                50, null),
  ('Impostos e taxas',         'Simples Nacional / MEI',               10, null),
  ('Impostos e taxas',         'Taxa de maquininha',                   20, null),
  ('Operação e crescimento',   'Marketing e anúncios',                 10, null),
  ('Operação e crescimento',   'Manutenção de equipamentos',           20, null),
  ('Operação e crescimento',   'Reformas e melhorias',                 30, null),
  ('Operação e crescimento',   'Cursos e treinamentos',                40, null),
  ('Operação e crescimento',   'Cortesias para clientes',              50, null),
  ('Outros',                   'Diversos',                             10, null)
) as cat(grupo_nome, nome, ordem, chave) on cat.grupo_nome = g.nome;

-- 7) Recarrega o schema cache do PostgREST pra que a API já enxergue as novas
--    tabelas/colunas sem precisar reiniciar nada.
notify pgrst, 'reload schema';
