import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { AdminSubNav } from "@/components/AdminSubNav";
import { TaxaCartaoForm } from "./TaxaCartaoForm";
import type { TaxaCartao } from "@/lib/types";

export default async function TaxasPage() {
  const supabase = await createClient();
  const [profile, { data: taxas }] = await Promise.all([
    getCurrentProfile(),
    supabase.from("taxas_cartao").select("*") as unknown as Promise<{
      data: TaxaCartao[] | null;
    }>,
  ]);

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <Header profile={profile} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <AdminSubNav ativo="/admin/taxas" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Taxas de cartão</h1>
        <p className="mt-1 text-sm text-muted">
          Percentual descontado da maquininha em cada venda no cartão. O desconto é
          dividido proporcionalmente entre o salão e a profissional — dinheiro e PIX não
          têm taxa.
        </p>

        <div className="mt-6">
          <TaxaCartaoForm taxas={taxas ?? []} />
        </div>
      </main>
    </div>
  );
}
