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

  // "Eliminar definitivamente" significa que el pedido nunca existió — a
  // diferencia de "Anular", que sí lo deja registrado. Los pedidos ya
  // cobrados (pay_order / record_item_payment) habían descontado inventario
  // según receta; hay que devolverlo antes de borrar el detalle de items.
  const { data: paidOrders } = await ctx.admin.from("orders").select("id").in("id", ids).eq("status", "pagado");
  const paidIds = (paidOrders || []).map((o: { id: string }) => o.id);

  if (paidIds.length) {
    const { data: items } = await ctx.admin.from("order_items").select("product_id,quantity").in("order_id", paidIds);
    const productIds = [...new Set((items || []).map((i: { product_id: string }) => i.product_id).filter(Boolean))];
    if (productIds.length) {
      const { data: recipeLines } = await ctx.admin.from("recipes").select("product_id,ingredient_id,quantity").in("product_id", productIds);
      const usage: Record<string, number> = {};
      for (const item of (items || []) as { product_id: string; quantity: number }[]) {
        const lines = (recipeLines || []).filter((r: { product_id: string }) => r.product_id === item.product_id);
        for (const line of lines as { ingredient_id: string; quantity: number }[]) {
          usage[line.ingredient_id] = (usage[line.ingredient_id] || 0) + line.quantity * item.quantity;
        }
      }
      const ingredientIds = Object.keys(usage);
      if (ingredientIds.length) {
        const { data: currentIngr } = await ctx.admin.from("ingredients").select("id,stock_current").in("id", ingredientIds);
        for (const ingr of (currentIngr || []) as { id: string; stock_current: number }[]) {
          await ctx.admin.from("ingredients").update({ stock_current: ingr.stock_current + (usage[ingr.id] || 0) }).eq("id", ingr.id);
        }
      }
    }
  }

  const { error: payErr } = await ctx.admin.from("payments").delete().in("order_id", ids);
  if (payErr) return Response.json({ error: payErr.message }, { status: 400 });

  const { error: itemsErr } = await ctx.admin.from("order_items").delete().in("order_id", ids);
  if (itemsErr) return Response.json({ error: itemsErr.message }, { status: 400 });

  const { error: ordersErr } = await ctx.admin.from("orders").delete().in("id", ids);
  if (ordersErr) return Response.json({ error: ordersErr.message }, { status: 400 });

  return Response.json({ ok: true, deleted: ids.length, restoredInventory: paidIds.length > 0 });
}
