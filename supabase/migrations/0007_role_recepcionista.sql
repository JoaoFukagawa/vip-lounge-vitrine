-- Terceiro papel: recepcionista vê agenda geral e clientes, mas não
-- comissões, financeiro nem a área de admin (usuários/serviços/taxas).
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'staff', 'recepcionista'));
