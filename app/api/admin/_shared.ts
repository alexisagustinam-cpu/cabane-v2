import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type AdminCtx = { admin: SupabaseClient } | { error: string; status: number };

// Toda ruta admin usa la service_role key en el servidor — evita depender
// de RLS para acciones que ni siquiera tienen política (ej. borrar pedidos).
export async function requireAdmin(req: Request): Promise<AdminCtx> {
  if (!SERVICE_KEY) {
    return { error: "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local del servidor", status: 500 };
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Sin sesión", status: 401 };
  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: "Sesión inválida", status: 401 };
  const { data: profile } = await admin.from("profiles").select("roles").eq("id", user.id).single();
  if (!profile?.roles?.includes("admin")) return { error: "Solo un admin puede hacer esto", status: 403 };
  return { admin };
}
