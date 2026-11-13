// O servidor roda em UTC (Vercel); "hoje" precisa ser calculado no fuso de
// São Paulo, senão early evening (21h-23h59 BRT) já virou "amanhã" pro servidor.
export function formatISO(d: Date) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function hojeSP() {
  return formatISO(new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })));
}

export function addDias(dataISO: string, n: number) {
  const d = new Date(dataISO + "T00:00:00");
  d.setDate(d.getDate() + n);
  return formatISO(d);
}
