// Sem Supabase configurado (ou com NEXT_PUBLIC_DEMO_MODE=true) o app roda em modo
// demonstração: banco falso no servidor, dados fictícios e o estado de cada
// visitante guardado em cookies. Ver src/lib/supabase/demo/.
export const IS_DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !process.env.NEXT_PUBLIC_SUPABASE_URL;
