-- ============================================================
-- FASE 6 — Multi-rol: un usuario puede tener más de un rol
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- Requiere haber corrido fase1, fase3, fase4 y fase5 (usan my_role()).
-- ============================================================

-- 1. Nueva columna: fuente de verdad para permisos a partir de ahora.
--    `role` (columna vieja) se mantiene en la tabla pero deja de usarse
--    para permisos — el código la sincroniza a roles[0] en cada escritura.
alter table profiles add column if not exists roles text[] not null default '{}'::text[];

update profiles set roles = array[role] where roles = '{}';

alter table profiles drop constraint if exists profiles_roles_valid;
alter table profiles add constraint profiles_roles_valid
  check (roles <@ array['waiter','kitchen','cashier','admin']::text[] and cardinality(roles) > 0);

-- 2. Función auxiliar: ¿el usuario logueado tiene este rol?
--    (security definer + search_path fijo para no entrar en recursión
--    al ser llamada desde políticas sobre la propia tabla profiles)
create or replace function public.has_role(role_name text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(role_name = any(roles), false) from profiles where id = auth.uid()
$$;

revoke execute on function public.has_role(text) from anon;
grant execute on function public.has_role(text) to authenticated;

-- 3. Funciones que validaban rol directamente (fase1, fase2, fase3)

create or replace function public.pay_order(p_order_id uuid, p_parts jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_sum   numeric := 0;
  part    jsonb;
begin
  if not (has_role('cashier') or has_role('admin')) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado para cobrar');
  end if;

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
    insert into payments (order_id, method, amount)
    values (p_order_id, part->>'method', (part->>'amount')::numeric);
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

create or replace function public.move_order(p_order_id uuid, p_table text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not (has_role('waiter') or has_role('cashier') or has_role('admin')) then
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

create or replace function public.register_waste(
  p_product_id uuid,
  p_quantity   numeric,
  p_reason     text,
  p_notes      text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_name    text;
  v_product products%rowtype;
begin
  if not (has_role('kitchen') or has_role('admin')) then
    return jsonb_build_object('ok', false, 'error', 'Solo cocina o admin pueden dar de baja');
  end if;
  select name into v_name from profiles where id = auth.uid();
  if p_quantity is null or p_quantity <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Cantidad inválida');
  end if;

  select * into v_product from products where id = p_product_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'El producto no existe');
  end if;

  insert into waste (product_id, product_name, quantity, unit_price, reason, notes, reported_by, reporter_name)
  values (p_product_id, v_product.name, p_quantity, coalesce(v_product.price, 0), p_reason, p_notes, auth.uid(), v_name);

  -- El producto dañado ya consumió sus ingredientes
  update ingredients i
  set stock_current = greatest(0, i.stock_current - r.quantity * p_quantity)
  from recipes r
  where r.ingredient_id = i.id and r.product_id = p_product_id;

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.register_waste(uuid, numeric, text, text) from anon;
grant execute on function public.register_waste(uuid, numeric, text, text) to authenticated;

-- 4. Políticas RLS — traducidas de my_role() a has_role() (fase1)

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or has_role('admin'));
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated
  with check (has_role('admin'));
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (has_role('admin'));
drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles for delete to authenticated
  using (has_role('admin'));

drop policy if exists products_write on products;
create policy products_write on products for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

drop policy if exists orders_insert on orders;
create policy orders_insert on orders for insert to authenticated
  with check (has_role('waiter') or has_role('admin'));
drop policy if exists orders_update on orders;
create policy orders_update on orders for update to authenticated
  using (has_role('kitchen') or has_role('cashier') or has_role('admin'));

drop policy if exists order_items_insert on order_items;
create policy order_items_insert on order_items for insert to authenticated
  with check (has_role('waiter') or has_role('admin'));

drop policy if exists payments_select on payments;
create policy payments_select on payments for select to authenticated
  using (has_role('cashier') or has_role('admin'));
drop policy if exists payments_insert on payments;
create policy payments_insert on payments for insert to authenticated
  with check (has_role('cashier') or has_role('admin'));

drop policy if exists ingredients_insert on ingredients;
create policy ingredients_insert on ingredients for insert to authenticated
  with check (has_role('admin'));
drop policy if exists ingredients_update on ingredients;
create policy ingredients_update on ingredients for update to authenticated
  using (has_role('admin') or has_role('cashier'));
drop policy if exists ingredients_delete on ingredients;
create policy ingredients_delete on ingredients for delete to authenticated
  using (has_role('admin'));

drop policy if exists recipes_write on recipes;
create policy recipes_write on recipes for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

drop policy if exists category_notes_write on category_notes;
create policy category_notes_write on category_notes for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

-- 5. Políticas RLS de fase3 (waste)

drop policy if exists waste_select on waste;
create policy waste_select on waste for select to authenticated
  using (has_role('kitchen') or has_role('admin'));
drop policy if exists waste_insert on waste;
create policy waste_insert on waste for insert to authenticated
  with check (has_role('kitchen') or has_role('admin'));
drop policy if exists waste_delete on waste;
create policy waste_delete on waste for delete to authenticated
  using (has_role('admin'));

-- 6. Políticas RLS de fase4 (expenses / fixed_expenses)

drop policy if exists expenses_all on expenses;
create policy expenses_all on expenses for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

drop policy if exists fixed_expenses_all on fixed_expenses;
create policy fixed_expenses_all on fixed_expenses for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

-- 7. Políticas RLS de fase5 (tables / categories / cash_closures)

drop policy if exists tables_write on tables;
create policy tables_write on tables for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

drop policy if exists categories_write on categories;
create policy categories_write on categories for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

drop policy if exists closures_select on cash_closures;
create policy closures_select on cash_closures for select to authenticated
  using (has_role('cashier') or has_role('admin'));
drop policy if exists closures_insert on cash_closures;
create policy closures_insert on cash_closures for insert to authenticated
  with check (has_role('cashier') or has_role('admin'));
drop policy if exists closures_update on cash_closures;
create policy closures_update on cash_closures for update to authenticated
  using (has_role('cashier') or has_role('admin'));
drop policy if exists closures_delete on cash_closures;
create policy closures_delete on cash_closures for delete to authenticated
  using (has_role('admin'));
