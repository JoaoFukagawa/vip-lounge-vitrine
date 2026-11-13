import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { IS_DEMO } from "@/lib/demo";
import { createDemoClient } from "@/lib/supabase/demo";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function createSupabaseClient(cookieStore: CookieStore) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // chamado a partir de um Server Component: middleware já cuida do refresh de sessão
          }
        },
      },
    }
  );
}

export async function createClient() {
  const cookieStore = await cookies();
  // Modo demonstração: banco falso com dados fictícios (src/lib/supabase/demo).
  if (IS_DEMO) return createDemoClient(cookieStore) as unknown as ReturnType<typeof createSupabaseClient>;
  return createSupabaseClient(cookieStore);
}
