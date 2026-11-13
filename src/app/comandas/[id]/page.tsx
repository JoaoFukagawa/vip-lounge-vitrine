import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { ComandaForm } from "@/components/ComandaForm";
import { CorrigirProfissional } from "./CorrigirProfissional";
import type { ComandaComItens, Profile, Servico } from "@/lib/types";

export default async function EditarComandaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [profile, { data: comanda }, { data: profissionais }, { data: servicos }] =
    await Promise.all([
      getCurrentProfile(),
      supabase
        .from("comandas")
        .select("*, comanda_itens(*), caixa:caixa_sessao_id(status)")
        .eq("id", id)
        .single() as unknown as Promise<{
        data: (ComandaComItens & { caixa: { status: string } | null }) | null;
      }>,
      supabase.from("profiles").select("*").order("nome") as unknown as Promise<{
        data: Profile[] | null;
      }>,
      supabase
        .from("servicos")
        .select("*")
        .eq("ativo", true)
        .order("ordem") as unknown as Promise<{ data: Servico[] | null }>,
    ]);

  if (!profile) redirect("/login");
  if (!comanda) notFound();

  const travada = comanda.caixa?.status !== "aberto";

  // Mesma regra da tela de nova comanda: com especialidade cadastrada, só mostra os
  // serviços dela. Itens que já existem na comanda continuam editáveis mesmo se não baterem.
  const servicosDisponiveis =
    profile.especialidades.length > 0
      ? (servicos ?? []).filter((s) => profile.especialidades.includes(s.nome))
      : servicos ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
        <h1 className="text-xl font-semibold tracking-tight">Editar comanda</h1>
        <div className="mt-6">
          <ComandaForm
            profissionais={profissionais ?? []}
            servicos={servicosDisponiveis}
            comandaId={comanda.id}
            travada={travada}
            inicial={{
              data: comanda.data,
              clienteNome: comanda.cliente_nome ?? "",
              clienteContato: comanda.cliente_contato ?? "",
              clienteId: comanda.cliente_id,
              pagamentos: comanda.pagamentos ?? [],
              itens: comanda.comanda_itens
                .sort((a, b) => a.ordem - b.ordem)
                .map((item) => ({
                  servico: item.servico,
                  profissionalId: item.profissional_id,
                  valor: item.valor,
                })),
            }}
          />
        </div>
        {travada && profile.role === "admin" && (
          <CorrigirProfissional
            itens={[...comanda.comanda_itens].sort((a, b) => a.ordem - b.ordem)}
            profissionais={(profissionais ?? []).map((p) => ({ id: p.id, nome: p.nome }))}
          />
        )}
      </main>
    </div>
  );
}
