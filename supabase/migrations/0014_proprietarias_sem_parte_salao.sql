-- Proprietárias ficam com 100% do serviço: a parte do salão (comissao_percentual
-- do serviço) não é descontada delas. A taxa da maquininha continua sendo
-- descontada normalmente. Editável em Admin → Usuários.
-- Comissões já pagas não mudam (o valor pago fica guardado em cada serviço).

begin;

alter table public.profiles
  add column isenta_parte_salao boolean not null default false;

-- (As proprietárias são marcadas em Admin → Usuários.)

notify pgrst, 'reload schema';

commit;
