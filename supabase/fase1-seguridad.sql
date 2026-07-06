-- ============================================================
-- FASE 1 — Seguridad y cobro atómico
-- Ejecutar COMPLETO en Supabase → SQL Editor
-- Es idempotente: se puede correr más de una vez sin problema.
-- ============================================================

-- 1. Fecha/hora en pagos (necesaria para el historial de cobros)
alter table payments add column if not exists created_at timestamptz not null default now();

-- 2. Función auxiliar: rol del usuario logueado
--    (security definer para que las políticas no entren en recursión)
create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

revoke execute on function public.my_role() from anon;
grant execute on function public.my_role() to authenticated;

-- 3. Cobro atómico: valida, registra pagos, marca pagado y
--    descuenta inventario en UNA transacción. Rechaza doble cobro.
create or replace function public.pay_order(p_order_id uuid, p_parts jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_role  text;
  v_order orders%rowtype;
  v_sum   numeric := 0;
  part    jsonb;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('cashier','admin') then
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

-- 4. Políticas RLS por rol
--    Hasta ahora cualquier usuario logueado podía escribir cualquier tabla.

alter table profiles       enable row level security;
alter table products       enable row level security;
alter table orders         enable row level security;
alter table order_items    enable row level security;
alter table payments       enable row level security;
alter table ingredients    enable row level security;
alter table recipes        enable row level security;
alter table category_notes enable row level security;

-- profiles: cada quien lee el suyo; solo admin gestiona
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or my_role() = 'admin');
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated
  with check (my_role() = 'admin');
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (my_role() = 'admin');
drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles for delete to authenticated
  using (my_role() = 'admin');

-- products: todos leen; solo admin escribe
drop policy if exists products_select on products;
create policy products_select on products for select to authenticated using (true);
drop policy if exists products_write on products;
create policy products_write on products for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- orders: todos leen; mesero/admin crean; cocina/caja/admin actualizan; nadie borra
drop policy if exists orders_select on orders;
create policy orders_select on orders for select to authenticated using (true);
drop policy if exists orders_insert on orders;
create policy orders_insert on orders for insert to authenticated
  with check (my_role() in ('waiter','admin'));
drop policy if exists orders_update on orders;
create policy orders_update on orders for update to authenticated
  using (my_role() in ('kitchen','cashier','admin'));

-- order_items: todos leen; mesero/admin crean
drop policy if exists order_items_select on order_items;
create policy order_items_select on order_items for select to authenticated using (true);
drop policy if exists order_items_insert on order_items;
create policy order_items_insert on order_items for insert to authenticated
  with check (my_role() in ('waiter','admin'));

-- payments: caja/admin leen y crean
drop policy if exists payments_select on payments;
create policy payments_select on payments for select to authenticated
  using (my_role() in ('cashier','admin'));
drop policy if exists payments_insert on payments;
create policy payments_insert on payments for insert to authenticated
  with check (my_role() in ('cashier','admin'));

-- ingredients: todos leen; admin gestiona; caja puede actualizar stock (descuento)
drop policy if exists ingredients_select on ingredients;
create policy ingredients_select on ingredients for select to authenticated using (true);
drop policy if exists ingredients_insert on ingredients;
create policy ingredients_insert on ingredients for insert to authenticated
  with check (my_role() = 'admin');
drop policy if exists ingredients_update on ingredients;
create policy ingredients_update on ingredients for update to authenticated
  using (my_role() in ('admin','cashier'));
drop policy if exists ingredients_delete on ingredients;
create policy ingredients_delete on ingredients for delete to authenticated
  using (my_role() = 'admin');

-- recipes: todos leen; solo admin escribe
drop policy if exists recipes_select on recipes;
create policy recipes_select on recipes for select to authenticated using (true);
drop policy if exists recipes_write on recipes;
create policy recipes_write on recipes for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- category_notes: todos leen; solo admin escribe
drop policy if exists category_notes_select on category_notes;
create policy category_notes_select on category_notes for select to authenticated using (true);
drop policy if exists category_notes_write on category_notes;
create policy category_notes_write on category_notes for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
