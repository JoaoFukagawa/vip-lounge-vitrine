"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/current-profile";
import { usernameToEmail } from "@/lib/auth";
import { hojeSP } from "@/lib/data";
import type { Role } from "@/lib/types";

function normalizarRole(valor: FormDataEntryValue | null): Role {
  if (valor === "admin" || valor === "recepcionista") return valor;
  return "staff";
}

export async function createUser(_prevState: string | null, formData: FormData) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") {
    return "Apenas administradores podem criar usuários.";
  }

  const nome = String(formData.get("nome") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = normalizarRole(formData.get("role"));

  if (!nome || !username || !password) {
    return "Preencha nome, usuário e senha.";
  }
  if (password.length < 6) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { nome, role },
  });

  if (error) {
    return error.message.includes("already been registered")
      ? "Esse nome de usuário já existe."
      : "Não foi possível criar o usuário.";
  }

  revalidatePath("/admin/usuarios");
  return null;
}

export async function deleteUser(userId: string) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") return;
  if (requester.id === userId) return;

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/admin/usuarios");
}

export async function atualizarProfile(_prevState: string | null, formData: FormData) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") {
    return "Apenas administradores podem editar profissionais.";
  }

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const role = normalizarRole(formData.get("role"));
  const especialidades = formData.getAll("especialidades").map(String);

  if (!id || !nome) return "Informe o nome do profissional.";

  const horarios: { profissional_id: string; dia_semana: number; horario_inicio: string; horario_fim: string }[] = [];
  for (let dia = 0; dia <= 6; dia++) {
    if (!formData.get(`trabalha_${dia}`)) continue;
    const inicio = String(formData.get(`inicio_${dia}`) ?? "");
    const fim = String(formData.get(`fim_${dia}`) ?? "");
    if (!inicio || !fim) continue;
    if (inicio >= fim) {
      return `O horário de início precisa ser antes do fim (dia ${dia}).`;
    }
    horarios.push({ profissional_id: id, dia_semana: dia, horario_inicio: inicio, horario_fim: fim });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      nome,
      role,
      especialidades,
      isenta_parte_salao: formData.get("isenta_parte_salao") === "on",
    })
    .eq("id", id);

  if (error) return "Não foi possível salvar as alterações.";

  await supabase.from("profissional_horarios").delete().eq("profissional_id", id);
  if (horarios.length > 0) {
    const { error: horariosError } = await supabase.from("profissional_horarios").insert(horarios);
    if (horariosError) return "Perfil salvo, mas não foi possível salvar os horários.";
  }

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${id}`);
  revalidatePath("/agendamentos");
  revalidatePath("/agendamentos/nova");
  return null;
}

export async function desativarUsuario(userId: string) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") return { error: "Apenas administradores." };
  if (requester.id === userId) return { error: "Você não pode desativar a si mesmo." };

  const supabase = await createClient();

  const hoje = hojeSP();
  const { count: pendentes } = await supabase
    .from("agendamentos")
    .select("id", { count: "exact", head: true })
    .eq("profissional_id", userId)
    .eq("status", "agendado")
    .gte("data", hoje);

  if (pendentes && pendentes > 0) {
    return {
      error: `Transfira os ${pendentes} agendamento${pendentes > 1 ? "s" : ""} futuro${pendentes > 1 ? "s" : ""} dela(e) antes de desativar.`,
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ ativo: false, desativado_em: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: "Não foi possível desativar o profissional." };

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/agendamentos");
  return { error: null };
}

export async function reativarUsuario(userId: string) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") return { error: "Apenas administradores." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ ativo: true, desativado_em: null })
    .eq("id", userId);

  if (error) return { error: "Não foi possível reativar o profissional." };

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/agendamentos");
  return { error: null };
}

export async function resetarSenha(_prevState: string | null, formData: FormData) {
  const requester = await getCurrentProfile();
  if (requester?.role !== "admin") {
    return "Apenas administradores podem resetar senhas.";
  }

  const userId = String(formData.get("id") ?? "");
  const novaSenha = String(formData.get("password") ?? "");

  if (!userId) return "Usuário inválido.";
  if (novaSenha.length < 6) return "A senha precisa ter pelo menos 6 caracteres.";

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: novaSenha });

  if (error) return "Não foi possível trocar a senha.";

  return null;
}
