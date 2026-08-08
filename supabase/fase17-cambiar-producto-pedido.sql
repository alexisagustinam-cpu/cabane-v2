-- ============================================================
-- FASE 17 — Cambiar un producto por otro en un pedido ya enviado
-- (ej: no había ingredientes para hacerlo). Solo mientras el pedido
-- entero sigue en status='enviado' (ningún ítem arrancó a prepararse)
-- y no tiene cobros registrados todavía.
--
-- No toca inventario/merma: el producto viejo nunca se llegó a
-- preparar (por eso se cambia), así que no hay insumos que reponer ni
-- que dar de baja. Eso es justamente lo que lo distingue de
-- register_waste (Fase 9), que sí es para productos que sí se
-- alcanzaron a preparar o gastar.
--
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- Requiere haber corrido fase6 (has_role), fase11 (barra/cocina) y fase12
-- (pago independiente).
-- ============================================================

create or replace function public.swap_order_item(
  p_order_id uuid,
  p_order_item_id uuid,
  p_new_product_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item  order_items%rowtype;
  v_product products%rowtype;
  v_station text;
begin
  if not (has_role('waiter') or has_role('kitchen') or has_role('bar') or has_role('admin')) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado para editar pedidos');
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El pedido no existe');
  end if;
  if v_order.status <> 'enviado' then
    return jsonb_build_object('ok', false, 'error', 'Ya se empezó a preparar este pedido, no se puede editar');
  end if;
  if v_order.payment_status = 'paid' then
    return jsonb_build_object('ok', false, 'error', 'Este pedido ya fue cobrado');
  end if;
  if exists (select 1 from payment_item_allocations where order_id = p_order_id) then
    return jsonb_build_object('ok', false, 'error', 'Este pedido ya tiene cobros parciales registrados');
  end if;

  select * into v_item from order_items where id = p_order_item_id and order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese producto no pertenece a este pedido');
  end if;

  select * into v_product from products where id = p_new_product_id and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El producto de reemplazo no existe o no está activo');
  end if;

  v_station := case when v_product.category in ('Bebidas','Cafés','Postres') then 'bar' else 'kitchen' end;

  update order_items set
    product_id = v_product.id,
    product_name = v_product.name,
    unit_price = v_product.price,
    station = v_station,
    item_status = 'enviado',
    notes = null
  where id = p_order_item_id;

  update orders set
    total = (select coalesce(sum(quantity * unit_price), 0) from order_items where order_id = p_order_id)
  where id = p_order_id;

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.swap_order_item(uuid, uuid, uuid) from anon;
grant execute on function public.swap_order_item(uuid, uuid, uuid) to authenticated;
