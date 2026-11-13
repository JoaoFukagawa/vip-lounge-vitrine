-- Permite dividir o pagamento de uma comanda em mais de uma forma
-- (ex: metade no cartão, metade no PIX)
alter table public.comandas add column pagamentos jsonb not null default '[]'::jsonb;

-- Migra os dados existentes: assume que o valor total foi pago naquela forma única
update public.comandas
set pagamentos = jsonb_build_array(
  jsonb_build_object('forma', forma_pagamento, 'valor', total, 'parcelas', parcelas)
)
where forma_pagamento is not null;

alter table public.comandas drop column forma_pagamento;
alter table public.comandas drop column parcelas;
