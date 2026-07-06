-- ============================================================
-- FASE 2 — Mapa de mesas y pedidos con nombre de cliente
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- ============================================================

-- 1. Nombre del cliente en cada pedido
alter table orders add column if not exists customer_name text;

-- 2. Mover un pedido a otra mesa (mesero, caja o admin) sin poder
--    tocar ningún otro campo del pedido.
create or replace function public.move_order(p_order_id uuid, p_table text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_role   text;
  v_status text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('waiter','cashier','admin') then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select status into v_status from orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El pedido no existe');
  end if;
  if v_status in ('pagado','cancelado') then
    return jsonb_build_object('ok', false, 'error', 'No se puede mover un pedido cerrado');
  end if;

  update orders set table_label = p_table where id = p_order_id;
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.move_order(uuid, text) from anon;
grant execute on function public.move_order(uuid, text) to authenticated;
