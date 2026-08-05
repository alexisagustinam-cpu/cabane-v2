// Gestión de usuarios con la service_role key (solo vive en el servidor).
// Evita el bug de auth.signUp desde el navegador, que deslogueaba al admin
// y lo dejaba logueado como el usuario recién creado.

import { requireAdmin } from "../_shared";

const VALID_ROLES = ["waiter", "kitchen", "bar", "cashier", "admin"];

function invalidRoles(roles: unknown): string | null {
  if (!Array.isArray(roles) || roles.length === 0) return "Falta al menos un rol";
  if (!roles.every(r => VALID_ROLES.includes(r))) return "Rol inválido";
  return null;
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { name, email, password, roles } = await req.json().catch(() => ({}));
  if (!name || !email || !password) {
    return Response.json({ error: "Faltan datos (nombre, email, contraseña)" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 6) {
    return Response.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }
  const roleErr = invalidRoles(roles);
  if (roleErr) return Response.json({ error: roleErr }, { status: 400 });

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = String(name).trim();
  const { data, error } = await ctx.admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { name: cleanName, role: roles[0], roles, email: cleanEmail },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const { error: pErr } = await ctx.admin.from("profiles")
    .upsert({ id: data.user.id, name: cleanName, role: roles[0], roles, email: cleanEmail });
  if (pErr) {
    // No dejar cuentas de Auth huérfanas si falla el perfil de permisos.
    await ctx.admin.auth.admin.deleteUser(data.user.id);
    return Response.json({ error: pErr.message }, { status: 400 });
  }

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
