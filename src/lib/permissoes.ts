import type { Profile, Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  staff: "Profissional",
  recepcionista: "Recepcionista",
};

// Agenda geral (calendário/lista de todo mundo) e Clientes: admin e recepcionista.
// Comissões, Financeiro e Admin (usuários/serviços/taxas): só admin.
export function podeVerAgendaGeral(profile: Pick<Profile, "role">) {
  return profile.role === "admin" || profile.role === "recepcionista";
}

export function podeVerClientes(profile: Pick<Profile, "role">) {
  return profile.role === "admin" || profile.role === "recepcionista";
}

// Tela do caixa (abrir, lançar, tirar dinheiro, fechar, conferir): só admin.
// Os demais lançam comandas e recebem duplicatas no caixa que o admin abriu.
export function podeGerenciarCaixa(profile: Pick<Profile, "role">) {
  return profile.role === "admin";
}

// Despesas expõem dados sensíveis (aluguel, pró-labore, salários) — só admin.
export function podeGerenciarFinanceiro(profile: Pick<Profile, "role">) {
  return profile.role === "admin";
}
