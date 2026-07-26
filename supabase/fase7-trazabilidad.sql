-- ============================================================
-- FASE 7 — Trazabilidad de pedidos/cobros + acceso más ajustado
-- a ingredientes y recetas.
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- Requiere haber corrido fase1 y fase6 (usa has_role()).
-- ============================================================

-- 1. Quién tomó el pedido y quién lo cobró — antes solo quedaba
--    registrado en mermas/gastos/cierres, no en pedidos ni pagos.
alter table orders add column if not exists created_by uuid references profiles(id) on delete set null;
alter table orders add column if not exists creator_name text;
alter table payments add column if not exists charged_by uuid references profiles(id) on delete set null;
alter table payments add column if not exists charger_name text;

-- 2. pay_order ahora guarda quién cobró en cada payment
create or replace function public.pay_order(p_order_id uuid, p_parts jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_sum   numeric := 0;
  v_name  text;
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

  for part in select * from jsonb_array_elements(p_parts) loop
    if part->>'method' not in ('efectivo','tarjeta','transferencia') then
      return jsonb_build_object('ok', false, 'error', 'Método de pago inválido');
    end if;
    v_sum := v_sum + (part->>'amount')::numeric;
  end loop;

  if abs(v_sum - v_order.total) > 0.01 then
    return jsonb_build_object('ok', false, 'error',
      format('La suma (%s) no coincide con el total (%s)', v_sum, v_order.total));
  end if;

  for part in select * from jsonb_array_elements(p_parts) loop
    insert into payments (order_id, method, amount, charged_by, charger_name)
    values (p_order_id, part->>'method', (part->>'amount')::numeric, auth.uid(), v_name);
  end loop;

  update orders set status = 'pagado' where id = p_order_id;

  -- Descuento de inventario según recetas
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

-- 3. ingredients/recipes: antes cualquier rol logueado podía leerlas
--    directo por API (aunque su pantalla nunca las mostrara). En el
--    código solo las usan caja (respaldo si pay_order no existiera) y
--    admin (Inventario/Config) — se ajusta el acceso a esos dos roles.
drop policy if exists ingredients_select on ingredients;
create policy ingredients_select on ingredients for select to authenticated
  using (has_role('cashier') or has_role('admin'));

drop policy if exists recipes_select on recipes;
create policy recipes_select on recipes for select to authenticated
  using (has_role('cashier') or has_role('admin'));
