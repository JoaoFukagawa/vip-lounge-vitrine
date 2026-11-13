import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { IS_DEMO } from "@/lib/demo";
import { resetDemoCookies } from "@/lib/supabase/demo";

// Modo demonstração: descarta as alterações do visitante e volta aos dados do dia.
export async function GET(request: NextRequest) {
  if (IS_DEMO) resetDemoCookies(await cookies());
  return NextResponse.redirect(new URL("/", request.url));
}
