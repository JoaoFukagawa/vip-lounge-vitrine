"use client";

import { useTransition } from "react";
import { excluirComanda } from "@/app/comandas/actions";

export function ExcluirComandaButton({ comandaId }: { comandaId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm("Excluir esta comanda?")) {
          startTransition(async () => {
            const r = await excluirComanda(comandaId);
            if (r.error) alert(r.error);
          });
        }
      }}
      className="text-sm text-danger/80 transition-colors hover:text-danger disabled:opacity-60 disabled:cursor-wait"
    >
      {pending ? "Excluindo..." : "Excluir"}
    </button>
  );
}
