import Link from "next/link";

const ITENS = [
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/servicos", label: "Serviços" },
  { href: "/admin/taxas", label: "Taxas de cartão" },
  { href: "/admin/categorias-despesa", label: "Categorias de despesa" },
] as const;

export function AdminSubNav({ ativo }: { ativo: (typeof ITENS)[number]["href"] }) {
  return (
    <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            item.href === ativo
              ? "border-accent-2/40 bg-accent-2/10 text-accent-2"
              : "border-border text-muted hover:border-accent-2 hover:text-accent-2"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
