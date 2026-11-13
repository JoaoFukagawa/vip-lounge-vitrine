// Não existe tabela de clientes — agrupamos comandas pelo nome digitado.
// Normaliza pra "Maria Silva", " maria  silva " e "MARIA SILVA" caírem no mesmo grupo.
export function normalizarNome(nome: string) {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}

export function chaveCliente(nome: string) {
  return encodeURIComponent(normalizarNome(nome));
}

// Extrai um número em formato E.164 sem "+" (o que o wa.me exige) a partir do
// texto livre digitado em cliente_contato. Retorna null se não parecer um
// telefone válido — não dá pra mandar WhatsApp sem número de verdade.
export function telefoneWhatsApp(contato: string | null | undefined): string | null {
  if (!contato) return null;
  const digitos = contato.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) return null;
  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return null;
}
