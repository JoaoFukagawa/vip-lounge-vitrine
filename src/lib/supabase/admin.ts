import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { IS_DEMO } from "@/lib/demo";
import { createDemoClient } from "@/lib/supabase/demo";

type AdminClient = ReturnType<typeof createSupabaseClient>;

// No modo demonstração, auth.admin.* opera no banco falso do visitante.
function createDemoAdminClient(): AdminClient {
  const demo = async () => createDemoClient(await cookies());
  return {
    auth: {
      admin: {
        createUser: async (a: Record<string, unknown>) => (await demo()).auth.admin.createUser(a),
        deleteUser: async (id: string) => (await demo()).auth.admin.deleteUser(id),
        updateUserById: async (id: string, a: Record<string, unknown>) => (await demo()).auth.admin.updateUserById(id, a),
      },
    },
  } as unknown as AdminClient;
}

// Cliente com service role — usar apenas em server actions/route handlers,
// nunca importar em código que roda no browser.
export function createAdminClient() {
  if (IS_DEMO) return createDemoAdminClient();
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
