import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Gestión de usuarios con la service_role key (solo vive en el servidor).
// Evita el bug de auth.signUp desde el navegador, que deslogueaba al admin
// y lo dejaba logueado como el usuario recién creado.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VALID_ROLES = ["waiter", "kitchen", "cashier", "admin"];

type AdminCtx = { admin: SupabaseClient } | { error: string; status: number };

function invalidRoles(roles: unknown): string | null {
  if (!Array.isArray(roles) || roles.length === 0) return "Falta al menos un rol";
  if (!roles.every(r => VALID_ROLES.includes(r))) return "Rol inválido";
  return null;
}

async function requireAdmin(req: Request): Promise<AdminCtx> {
  if (!SERVICE_KEY) {
    return { error: "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local del servidor", status: 500 };
  }
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Sin sesión", status: 401 };
  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: "Sesión inválida", status: 401 };
  const { data: profile } = await admin.from("profiles").select("roles").eq("id", user.id).single();
  if (!profile?.roles?.includes("admin")) return { error: "Solo un admin puede gestionar usuarios", status: 403 };
  return { admin };
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { name, email, password, roles } = await req.json().catch(() => ({}));
  if (!name || !email || !password) {
    return Response.json({ error: "Faltan datos (nombre, email, contraseña)" }, { status: 400 });
  }
  const roleErr = invalidRoles(roles);
  if (roleErr) return Response.json({ error: roleErr }, { status: 400 });

  const { data, error } = await ctx.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const { error: pErr } = await ctx.admin.from("profiles")
    .upsert({ id: data.user.id, name, role: roles[0], roles, email });
  if (pErr) return Response.json({ error: pErr.message }, { status: 400 });

  return Response.json({ ok: true, id: data.user.id });
}

export async function PATCH(req: Request) {
  const ctx = await requireAdmin(req);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { id, name, email, password, roles } = await req.json().catch(() => ({}));
  if (!id) return Response.json({ error: "Falta el id del usuario" }, { status: 400 });
  if (roles !== undefined) {
    const roleErr = invalidRoles(roles);
    if (roleErr) return Response.json({ error: roleErr }, { status: 400 });
  }

  if (email || password) {
    const { error: aErr } = await ctx.admin.auth.admin.updateUserById(id, {
      ...(email ? { email, email_confirm: true } : {}),
      ...(password ? { password } : {}),
    });
    if (aErr) return Response.json({ error: aErr.message }, { status: 400 });
  }

  const profileFields: Record<string, unknown> = {};
  if (name) profileFields.name = name;
  if (email) profileFields.email = email;
  if (roles !== undefined) { profileFields.roles = roles; profileFields.role = roles[0]; }

  if (Object.keys(profileFields).length) {
    const { error: pErr } = await ctx.admin.from("profiles").update(profileFields).eq("id", id);
    if (pErr) return Response.json({ error: pErr.message }, { status: 400 });
  }

  return Response.json({ ok: true });
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
