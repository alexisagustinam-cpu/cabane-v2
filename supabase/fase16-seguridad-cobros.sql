-- ============================================================
-- FASE 16 — Seguridad de precios/cobros y liberación de mesas
-- Ejecutar DESPUÉS de Fase 15, en Supabase → SQL Editor. Idempotente.
-- NO se ejecuta desde la app. Aplicar solo cuando se suba la versión
-- nueva a producción (la app funciona igual con o sin esta fase).
--
-- Corrige:
--  1. El mesero no podía liberar una mesa (RLS solo deja a caja/admin
--     modificar pedidos) y el update fallaba en silencio.
--  2. El precio unitario y el total del pedido los mandaba el teléfono del
--     mesero: ahora la base toma el precio real del producto y recalcula.
--  3. Con acceso de caja se podía cambiar total o payment_status de un
--     pedido directamente, sin registrar el pago.
--  4. pay_order validaba la columna vieja `role`: un usuario con roles
--     ['waiter','cashier'] (role = 'waiter') no podía cobrar.
-- ============================================================

-- 1. Liberar mesa: mesero, caja y admin --------------------------------
create or replace function public.release_table(p_table text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not (has_role('waiter') or has_role('cashier') or has_role('admin')) then
    return jsonb_build_object('ok', false, 'error', 'Tu usuario no puede liberar mesas');
  end if;
  update orders set table_released_at = now()
  where table_label = p_table and table_released_at is null
    and payment_status = 'paid' and status = 'listo';
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'La mesa no tiene pedidos pagados y listos para liberar');
  end if;
  return jsonb_build_object('ok', true, 'released', v_count);
end $$;
revoke execute on function public.release_table(text) from anon;
grant execute on function public.release_table(text) to authenticated;

-- 2. Precio real del producto y total calculado en la base ------------
create or replace function public.order_item_real_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_price numeric;
begin
  if new.product_id is not null then
    select price into v_price from products where id = new.product_id;
    if found then new.unit_price := v_price; end if;
  end if;
  return new;
end $$;

drop trigger if exists order_items_real_price on order_items;
create trigger order_items_real_price
  before insert on order_items
  for each row execute function public.order_item_real_price();

create or replace function public.recalc_order_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  update orders o
  set total = coalesce((select sum(quantity * unit_price) from order_items where order_id = v_order_id), 0)
  where o.id = v_order_id and o.payment_status = 'pending';
  return null;
end $$;

drop trigger if exists order_items_recalc_total on order_items;
create trigger order_items_recalc_total
  after insert or delete or update of quantity, unit_price on order_items
  for each row execute function public.recalc_order_total();

-- 3. Total y estado de pago solo cambian por las funciones de cobro ---
-- Las funciones security definer (pay_order, record_item_payment,
-- recalc_order_total) corren como dueño de la base, no como
-- 'authenticated', así que no las bloquea. Admin conserva acceso directo.
create or replace function public.protect_order_money()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not has_role('admin')
     and (new.total is distinct from old.total or new.payment_status is distinct from old.payment_status) then
    raise exception 'El total y el estado de pago solo cambian al cobrar desde la caja';
  end if;
  return new;
end $$;

drop trigger if exists orders_protect_money on orders;
create trigger orders_protect_money
  before update on orders
  for each row execute function public.protect_order_money();

-- 4. pay_order con multi-rol (misma lógica de Fase 12) -----------------
-- También vuelve a guardar quién cobró (charged_by/charger_name, Fase 7):
-- la versión de Fase 12 lo había perdido y el historial salía sin cajero.
create or replace function public.pay_order(p_order_id uuid, p_parts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype; v_sum numeric := 0; part jsonb; v_name text;
begin
  if not (has_role('cashier') or has_role('admin')) then return jsonb_build_object('ok',false,'error','No autorizado para cobrar'); end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','El pedido no existe'); end if;
  if v_order.status = 'cancelado' then return jsonb_build_object('ok',false,'error','El pedido está cancelado'); end if;
  if v_order.payment_status = 'paid' then return jsonb_build_object('ok',false,'error','Este pedido ya fue cobrado'); end if;
  for part in select * from jsonb_array_elements(p_parts) loop
    if part->>'method' not in ('efectivo','tarjeta','transferencia') or (part->>'amount')::numeric <= 0 then
      return jsonb_build_object('ok',false,'error','Método o importe de pago inválido');
    end if;
    v_sum := v_sum + (part->>'amount')::numeric;
  end loop;
  if abs(v_sum - v_order.total) > 0.01 then return jsonb_build_object('ok',false,'error','La suma no coincide con el total'); end if;
  select name into v_name from profiles where id = auth.uid();
  for part in select * from jsonb_array_elements(p_parts) loop
    insert into payments (order_id,method,amount,charged_by,charger_name)
    values (p_order_id,part->>'method',(part->>'amount')::numeric,auth.uid(),v_name);
  end loop;
  update orders set payment_status = 'paid' where id = p_order_id;
  update ingredients i set stock_current = greatest(0, i.stock_current - u.qty)
  from (select r.ingredient_id,sum(r.quantity*oi.quantity) qty from order_items oi join recipes r on r.product_id=oi.product_id where oi.order_id=p_order_id group by r.ingredient_id) u
  where i.id=u.ingredient_id;
  return jsonb_build_object('ok',true);
end $$;
revoke execute on function public.pay_order(uuid,jsonb) from anon;
grant execute on function public.pay_order(uuid,jsonb) to authenticated;
