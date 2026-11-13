-- Backfill: importa de uma vez todo nome distinto já usado em comandas antigas
-- pra dentro da tabela `clientes`, e liga o cliente_id de volta em comandas e
-- agendamentos existentes que baterem pelo nome.
--
-- Risco aceito conscientemente (decisão do usuário, não é acidente): duas
-- pessoas diferentes que tenham o mesmo nome digitado (ex: duas "Ana Silva")
-- são fundidas num único cadastro aqui, misturando o histórico das duas.
-- Rodar de novo depois não duplica quem já tiver cadastro.

-- 1) Um cadastro por nome normalizado, usando o nome mais recente e o
--    primeiro contato não-nulo encontrado. Cada instrução abaixo é
--    autossuficiente (sem tabela temporária, que não sobrevive se o editor
--    trocar de conexão entre um comando e outro).
insert into public.clientes (nome, contato)
select por_cliente.nome, por_cliente.contato
from (
  select
    lower(regexp_replace(trim(cliente_nome), '\s+', ' ', 'g')) as chave,
    (array_agg(cliente_nome order by data desc))[1] as nome,
    (array_agg(cliente_contato order by (cliente_contato is null), data desc))[1] as contato
  from public.comandas
  where cliente_nome is not null and trim(cliente_nome) <> ''
  group by 1
) por_cliente
where not exists (
  select 1 from public.clientes c
  where lower(regexp_replace(trim(c.nome), '\s+', ' ', 'g')) = por_cliente.chave
);

-- 2) Liga o cliente_id em comandas antigas que baterem pelo nome (inclusive as
--    que já tinham cliente cadastrado antes desse backfill).
update public.comandas c
set cliente_id = cl.id
from public.clientes cl
where c.cliente_id is null
  and c.cliente_nome is not null
  and lower(regexp_replace(trim(c.cliente_nome), '\s+', ' ', 'g'))
    = lower(regexp_replace(trim(cl.nome), '\s+', ' ', 'g'));

-- 3) Mesma coisa pra agendamentos antigos.
update public.agendamentos a
set cliente_id = cl.id
from public.clientes cl
where a.cliente_id is null
  and a.cliente_nome is not null
  and lower(regexp_replace(trim(a.cliente_nome), '\s+', ' ', 'g'))
    = lower(regexp_replace(trim(cl.nome), '\s+', ' ', 'g'));
