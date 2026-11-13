"use server";

import { createClient } from "@/lib/supabase/server";

export type ClienteResultado = { id: string; nome: string; contato: string | null };

export async function buscarClientes(query: string): Promise<ClienteResultado[]> {
  const termo = query.trim();
  if (termo.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, contato")
    .ilike("nome", `%${termo}%`)
    .order("nome")
    .limit(6);

  if (error) {
    // Não interrompe a digitação por causa disso, mas fica registrado nos logs
    // do servidor pra dar pra diagnosticar (ex: PostgREST ainda não recarregou
    // o schema depois de uma migration recente).
    console.error("buscarClientes falhou:", error.message);
    return [];
  }

  return data ?? [];
}

export async function criarCliente(
  nome: string,
  contato: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return { ok: false, error: "Informe o nome da cliente." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .insert({ nome: nomeLimpo, contato: contato.trim() || null })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Não foi possível cadastrar a cliente." };
  return { ok: true, id: data.id };
}
