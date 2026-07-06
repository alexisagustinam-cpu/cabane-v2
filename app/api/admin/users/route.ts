import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Gestión de usuarios con la service_role key (solo vive en el servidor).
// Evita el bug de auth.signUp desde el navegador, que deslogueaba al admin
// y lo dejaba logueado como el usuario recién creado.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type AdminCtx = { admin: SupabaseClient } | { error: string; status: number };

async function requireAdmin(req: Request): Promise<AdminCtx> {
  if (!SERVICE_KEY) {
    return { error: "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local del servidor", status: 500 };
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Sin sesión", status: 401 };
  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: "Sesión inválida", status: 401 };
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Solo un admin puede gestionar usuarios", status: 403 };
  return { admin };
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { name, email, password, role } = await req.json().catch(() => ({}));
  if (!name || !email || !password || !role) {
    return Response.json({ error: "Faltan datos (nombre, email, contraseña, rol)" }, { status: 400 });
  }
  if (!["waiter", "kitchen", "cashier", "admin"].includes(role)) {
    return Response.json({ error: "Rol inválido" }, { status: 400 });
  }

  const { data, error } = await ctx.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const { error: pErr } = await ctx.admin.from("profiles").upsert({ id: data.user.id, name, role, email });
  if (pErr) return Response.json({ error: pErr.message }, { status: 400 });

  return Response.json({ ok: true, id: data.user.id });
}

export async function DELETE(req: Request) {
  const ctx = await requireAdmin(req);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return Response.json({ error: "Falta el id del usuario" }, { status: 400 });

  const { error: pErr } = await ctx.admin.from("profiles").delete().eq("id", id);
  if (pErr) return Response.json({ error: pErr.message }, { status: 400 });

  // Borra también la cuenta de auth para liberar el email
  const { error: aErr } = await ctx.admin.auth.admin.deleteUser(id);
  if (aErr) return Response.json({ ok: true, warning: `Perfil quitado, pero la cuenta de auth no se pudo borrar: ${aErr.message}` });

  return Response.json({ ok: true });
}
