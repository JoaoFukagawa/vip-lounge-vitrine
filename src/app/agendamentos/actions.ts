"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/current-profile";
import { hojeSP } from "@/lib/data";
import { podeVerAgendaGeral } from "@/lib/permissoes";

export type AgendamentoInput = {
  data: string;
  horaInicio: string;
  duracaoMinutos: number;
  clienteNome: string;
  clienteContato: string;
  clienteId?: string | null;
  profissionalId: string;
  servicoId: string | null;
  observacoes: string;
};

function isExclusionViolation(error: { code?: string } | null) {
  // 23P01 = exclusion_violation no Postgres — é a constraint que impede
  // dois agendamentos sobrepostos pro mesmo profissional.
  return error?.code === "23P01";
}

function isWorkScheduleViolation(error: { code?: string } | null) {
  // P0001 = raise exception no trigger agendamentos_valida_horario_trabalho
  // (fora do horário de trabalho daquele dia, ou dia de folga).
  return error?.code === "P0001";
}

function revalidarAgenda() {
  revalidatePath("/agendamentos");
  revalidatePath("/agendamentos/lista");
  revalidatePath("/agendamentos/minha");
}

export async function criarAgendamento(input: AgendamentoInput) {
  const supabase = await createClient();
  const requester = await getCurrentProfile();
  if (!requester) return { error: "Sessão expirada, faça login novamente." };

  if (!input.clienteNome.trim()) return { error: "Informe o nome do cliente." };
  if (!input.profissionalId) return { error: "Selecione o profissional." };
  if (input.data < hojeSP()) {
    return { error: "Não é possível agendar em uma data passada." };
  }
  // Profissional só marca horário pra si mesma — admin e recepção marcam pra qualquer uma.
  if (requester.role === "staff" && input.profissionalId !== requester.id) {
    return { error: "Você só pode criar agendamentos para você mesma." };
  }

  const { error } = await supabase.from("agendamentos").insert({
    data: input.data,
    hora_inicio: input.horaInicio,
    duracao_minutos: input.duracaoMinutos,
    cliente_nome: input.clienteNome.trim(),
    cliente_contato: input.clienteContato.trim() || null,
    cliente_id: input.clienteId ?? null,
    profissional_id: input.profissionalId,
    servico_id: input.servicoId,
    observacoes: input.observacoes.trim() || null,
    criado_por: requester.id,
  });

  if (error) {
    if (isExclusionViolation(error)) {
      return { error: "Esse profissional já tem um agendamento nesse horário." };
    }
    if (isWorkScheduleViolation(error)) {
      return { error: error.message };
    }
    return { error: "Não foi possível criar o agendamento." };
  }

  revalidarAgenda();
  redirect(podeVerAgendaGeral(requester) ? "/agendamentos" : "/agendamentos/minha");
}

export async function cancelarAgendamento(agendamentoId: string, motivo: string) {
  const supabase = await createClient();
  await supabase
    .from("agendamentos")
    .update({ status: "cancelado", motivo_cancelamento: motivo || null })
    .eq("id", agendamentoId);
  revalidarAgenda();
}

export async function marcarNaoCompareceu(agendamentoId: string) {
  const supabase = await createClient();
  await supabase
    .from("agendamentos")
    .update({ status: "nao_compareceu" })
    .eq("id", agendamentoId);
  revalidarAgenda();
}

export async function transferirAgendamento(
  agendamentoId: string,
  novoProfissionalId: string,
  motivo: string
) {
  const requester = await getCurrentProfile();
  if (!requester) return { error: "Sessão expirada, faça login novamente." };
  if (!podeVerAgendaGeral(requester)) {
    return { error: "Só admin e recepção podem transferir agendamentos." };
  }

  const supabase = await createClient();

  const { data: atual, error: fetchError } = await supabase
    .from("agendamentos")
    .select("profissional_id")
    .eq("id", agendamentoId)
    .single();

  if (fetchError || !atual) return { error: "Agendamento não encontrado." };
  if (atual.profissional_id === novoProfissionalId) {
    return { error: "Escolha um profissional diferente do atual." };
  }

  const { error: updateError } = await supabase
    .from("agendamentos")
    .update({ profissional_id: novoProfissionalId })
    .eq("id", agendamentoId);

  if (updateError) {
    if (isExclusionViolation(updateError)) {
      return { error: "O profissional escolhido já tem um agendamento nesse horário." };
    }
    if (isWorkScheduleViolation(updateError)) {
      return { error: updateError.message };
    }
    return { error: "Não foi possível transferir o agendamento." };
  }

  await supabase.from("agendamento_transferencias").insert({
    agendamento_id: agendamentoId,
    profissional_anterior_id: atual.profissional_id,
    profissional_novo_id: novoProfissionalId,
    motivo: motivo || null,
    transferido_por: requester.id,
  });

  revalidarAgenda();
  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${atual.profissional_id}`);
  return { error: null };
}
