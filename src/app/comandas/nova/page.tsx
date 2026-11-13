import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { buscarCaixaAberto } from "@/lib/caixa";
import { Header } from "@/components/Header";
import { ComandaForm, type ComandaFormInicial } from "@/components/ComandaForm";
import type { Agendamento, Profile, Servico } from "@/lib/types";

export default async function NovaComandaPage({
  searchParams,
}: {
  searchParams: Promise<{ agendamentoId?: string }>;
}) {
  const { agendamentoId } = await searchParams;

  const supabase = await createClient();
  const [profile, { data: profissionais }, { data: servicos }, caixa] = await Promise.all([
    getCurrentProfile(),
    supabase.from("profiles").select("*").order("nome") as unknown as Promise<{
      data: Profile[] | null;
    }>,
    supabase
      .from("servicos")
      .select("*")
      .eq("ativo", true)
      .order("ordem") as unknown as Promise<{ data: Servico[] | null }>,
    buscarCaixaAberto(supabase),
  ]);

  if (!profile) redirect("/login");

  // Se ela tem especialidade cadastrada, só mostra os serviços dela — evita
  // escolher errado no meio da lista inteira. Sem especialidade definida (ex: admin), mostra tudo.
  const servicosDisponiveis =
    profile.especialidades.length > 0
      ? (servicos ?? []).filter((s) => profile.especialidades.includes(s.nome))
      : servicos ?? [];

  let inicial: ComandaFormInicial | undefined;

  if (agendamentoId) {
    const { data: agendamento } = (await supabase
      .from("agendamentos")
      .select("*, servico:servico_id(id, nome)")
      .eq("id", agendamentoId)
      .single()) as unknown as {
      data: (Agendamento & { servico: { id: string; nome: string } | null }) | null;
    };

    // Já foi concluído antes (ex: clique duplo) — manda pra comanda que já existe em vez de duplicar.
    if (agendamento?.comanda_id) redirect(`/comandas/${agendamento.comanda_id}`);

    if (agendamento) {
      inicial = {
        data: agendamento.data,
        clienteNome: agendamento.cliente_nome,
        clienteContato: agendamento.cliente_contato ?? "",
        clienteId: agendamento.cliente_id,
        pagamentos: [],
        itens: agendamento.servico
          ? [
              {
                servico: agendamento.servico.nome,
                profissionalId: agendamento.profissional_id,
                valor: 0,
              },
            ]
          : [],
      };
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <h1 className="text-xl font-semibold tracking-tight">Nova comanda</h1>
        <div className="mt-6">
          <ComandaForm
            profissionais={profissionais ?? []}
            servicos={servicosDisponiveis}
            agendamentoId={agendamentoId}
            inicial={inicial}
            semCaixaAberto={!caixa}
            podeAbrirCaixa={profile.role === "admin"}
          />
        </div>
      </main>
    </div>
  );
}
