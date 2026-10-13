-- ============================================================
-- FASE 19 — Cambiar un producto también cuando el pedido ya está
-- "preparando" (antes solo se podía con el pedido en "enviado").
--
-- Caso real: cocina marca "preparando" y después se dan cuenta de que
-- falta un ingrediente, o el cliente cambia de idea. Ahora se puede
-- cambiar mientras ESE producto no esté listo.
--
-- Sigue bloqueado:
--  · el producto que ya está "listo" (ya se entregó / ya se hizo)
--  · pedidos cobrados o con cobros parciales por persona
--  · pedidos cancelados
--
-- Inventario: no se toca automáticamente. Si el producto original ya se
-- había empezado a preparar y se desperdició, se registra con "Dar de baja"
-- (la función devuelve in_preparation = true para que la app lo recuerde).
--
-- Ejecutar COMPLETO en Supabase → SQL Editor. Idempotente.
-- Compatible con la app anterior: solo amplía lo que se permite.
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
  v_was_preparing boolean;
begin
  if not (has_role('waiter') or has_role('kitchen') or has_role('bar') or has_role('admin')) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado para editar pedidos');
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El pedido no existe');
  end if;
  if v_order.status not in ('enviado','preparando') then
    return jsonb_build_object('ok', false, 'error', 'Este pedido ya está listo o cancelado, no se puede editar');
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
  if v_item.item_status = 'listo' then
    return jsonb_build_object('ok', false, 'error', 'Ese producto ya está listo, no se puede cambiar');
  end if;
  v_was_preparing := v_item.item_status = 'preparando';

  select * into v_product from products where id = p_new_product_id and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El producto de reemplazo no existe o no está activo');
  end if;

  v_station := case when v_product.category in ('Bebidas','Cafés','Postres') then 'bar' else 'kitchen' end;

  -- El reemplazo entra como "enviado": la estación lo ve como algo nuevo por hacer.
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

  return jsonb_build_object('ok', true, 'in_preparation', v_was_preparing);
end
$$;

revoke execute on function public.swap_order_item(uuid, uuid, uuid) from anon;
grant execute on function public.swap_order_item(uuid, uuid, uuid) to authenticated;
