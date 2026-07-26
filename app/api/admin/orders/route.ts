// Borrado permanente de pedidos (ej. pruebas del sistema antes de abrir).
// No existe política RLS de delete en orders/order_items/payments — por
// eso esto necesita la service_role key, igual que /api/admin/users.

import { requireAdmin } from "../_shared";

export async function DELETE(req: Request) {
  const ctx = await requireAdmin(req);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) {
    return Response.json({ error: "Faltan pedidos a eliminar" }, { status: 400 });
  }

  const { error: payErr } = await ctx.admin.from("payments").delete().in("order_id", ids);
  if (payErr) return Response.json({ error: payErr.message }, { status: 400 });

  const { error: itemsErr } = await ctx.admin.from("order_items").delete().in("order_id", ids);
  if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 400 });

  const { error: ordersErr } = await ctx.admin.from("orders").delete().in("id", ids);
  if (ordersErr) return Response.json({ error: ordersErr.message }, { status: 400 });

  return Response.json({ ok: true, deleted: ids.length });
}
