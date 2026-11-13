// Profissionais logam só com "usuário" (sem precisar ter e-mail próprio).
// Internamente isso vira um e-mail fake no domínio abaixo, que é o formato que o Supabase Auth exige.
const LOGIN_DOMAIN = "viplounge.local";

export function usernameToEmail(usernameOrEmail: string) {
  const value = usernameOrEmail.trim().toLowerCase();
  if (value.includes("@")) return value;
  return `${value.replace(/\s+/g, "")}@${LOGIN_DOMAIN}`;
}
