-- ============================================================
-- FASE 12 — pay_order (cobro completo por método/Dividir/cobrar mesa
-- completa) no sabía nada de los pagos parciales por persona (fase 11):
-- si una orden ya tenía cobros parciales por item y después se usaba
-- un botón de cobro total, exigía el TOTAL completo otra vez, lo que
-- hubiera duplicado el cobro registrado. Ahora exige lo que falta
-- (total - ya cobrado), sea por el método que sea que se haya cobrado antes.
-- Compatible: si no hay cobros previos, se comporta exactamente igual
-- que antes (falta = total).
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- Requiere haber corrido fase7 y fase11.
-- ============================================================

create or replace function public.pay_order(p_order_id uuid, p_parts jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_sum   numeric := 0;
  v_name  text;
  v_already_collected numeric;
  v_pending_total numeric;
  part    jsonb;
begin
  if not (has_role('cashier') or has_role('admin')) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado para cobrar');
  end if;

  select name into v_name from profiles where id = auth.uid();

  -- Bloquea la fila: si dos cajas cobran a la vez, la segunda espera y ve el estado real
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El pedido no existe');
  end if;
  if v_order.status = 'pagado' then
    return jsonb_build_object('ok', false, 'error', 'Este pedido ya fue cobrado');
  end if;
  if v_order.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'error', 'Este pedido está cancelado');
  end if;

  -- Lo ya cobrado incluye tanto cobros previos de pay_order como pagos
  -- parciales por persona (record_item_payment) — ambos insertan en payments.
  select coalesce(sum(amount),0) into v_already_collected from payments where order_id = p_order_id;
  v_pending_total := v_order.total - v_already_collected;

  for part in select * from jsonb_array_elements(p_parts) loop
    if part->>'method' not in ('efectivo','tarjeta','transferencia') then
      return jsonb_build_object('ok', false, 'error', 'Método de pago inválido');
    end if;
    v_sum := v_sum + (part->>'amount')::numeric;
  end loop;

  if abs(v_sum - v_pending_total) > 0.01 then
    return jsonb_build_object('ok', false, 'error',
      format('La suma (%s) no coincide con lo pendiente (%s)', v_sum, v_pending_total));
  end if;

  for part in select * from jsonb_array_elements(p_parts) loop
    insert into payments (order_id, method, amount, charged_by, charger_name)
    values (p_order_id, part->>'method', (part->>'amount')::numeric, auth.uid(), v_name);
  end loop;

  update orders set status = 'pagado' where id = p_order_id;

  -- Descuento de inventario según recetas — si el pedido ya se venía
  -- cobrando por persona, esto todavía no se había descontado (fase 11
  -- solo descuenta cuando el pedido queda cubierto por completo por esa
  -- vía), así que acá se hace por primera y única vez.
  update ingredients i
  set stock_current = greatest(0, i.stock_current - u.qty)
  from (
    select r.ingredient_id, sum(r.quantity * oi.quantity) as qty
    from order_items oi
    join recipes r on r.product_id = oi.product_id
    where oi.order_id = p_order_id
    group by r.ingredient_id
  ) u
  where i.id = u.ingredient_id;

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.pay_order(uuid, jsonb) from anon;
grant execute on function public.pay_order(uuid, jsonb) to authenticated;
