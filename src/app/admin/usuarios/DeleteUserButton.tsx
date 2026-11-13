"use client";

import { useTransition } from "react";
import { deleteUser } from "./actions";

export function DeleteUserButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Remover este usuário? Ele não vai mais conseguir entrar no sistema.")) {
          startTransition(() => deleteUser(userId));
        }
      }}
      className="text-sm text-danger/80 transition-colors hover:text-danger disabled:opacity-60 disabled:cursor-wait"
    >
      {pending ? "Removendo..." : "Remover"}
    </button>
  );
}
