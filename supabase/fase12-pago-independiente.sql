-- ============================================================
-- FASE 12 — Pago independiente de la preparación
-- Ejecutar DESPUÉS de Fase 11. Este archivo NO se ejecuta desde la app.
-- Idempotente: conserva pagos históricos y no debilita RLS.
-- ============================================================

-- 1. Separar el ciclo de pago de orders.status (que queda solo para preparación).
alter table orders add column if not exists payment_status text;

-- Legacy: un status pagado o cualquier fila en payments es cobrado. Los demás,
-- incluso cancelados sin pago, quedan pending para no inventar un cobro.
update orders o
set payment_status = case
  when o.status = 'pagado' then 'paid'
  when exists (select 1 from payments p where p.order_id = o.id) then 'paid'
  else 'pending'
end
where o.payment_status is null or o.payment_status not in ('pending','paid');

alter table orders alter column payment_status set default 'pending';
alter table orders alter column payment_status set not null;
alter table orders drop constraint if exists orders_payment_status_valid;
alter table orders add constraint orders_payment_status_valid check (payment_status in ('pending','paid'));

-- Un pagado heredado ya estaba terminado en el modelo antiguo. Conservamos esa
-- semántica una sola vez y liberamos status para que Fase 11 pueda agregar ítems.
update orders set status = 'listo' where status = 'pagado';

-- Reemplaza cualquier check heredado de status que todavía permita/obligue pagado.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
      and conname <> 'orders_payment_status_valid'
  loop
    execute format('alter table public.orders drop constraint if exists %I', c.conname);
  end loop;
end $$;
alter table orders add constraint orders_status_valid check (status in ('enviado','preparando','listo','cancelado'));

-- 2. Cobro transaccional e idempotente: bloquea la fila y jamás modifica status.
create or replace function public.pay_order(p_order_id uuid, p_parts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; v_order orders%rowtype; v_sum numeric := 0; part jsonb;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('cashier','admin') then return jsonb_build_object('ok',false,'error','No autorizado para cobrar'); end if;
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
  for part in select * from jsonb_array_elements(p_parts) loop
    insert into payments (order_id,method,amount) values (p_order_id,part->>'method',(part->>'amount')::numeric);
  end loop;
  update orders set payment_status = 'paid' where id = p_order_id;
  update ingredients i set stock_current = greatest(0, i.stock_current - u.qty)
  from (select r.ingredient_id,sum(r.quantity*oi.quantity) qty from order_items oi join recipes r on r.product_id=oi.product_id where oi.order_id=p_order_id group by r.ingredient_id) u
  where i.id=u.ingredient_id;
  return jsonb_build_object('ok',true);
end $$;
revoke execute on function public.pay_order(uuid,jsonb) from anon;
grant execute on function public.pay_order(uuid,jsonb) to authenticated;

-- 3. Compatibilidad con el agregado de Fase 11: solo cancelado inmoviliza la cabecera.
create or replace function public.sync_order_status_from_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order_id uuid := coalesce(new.order_id, old.order_id); v_status text;
begin
  select case when bool_and(item_status = 'listo') then 'listo' when bool_or(item_status in ('preparando','listo')) then 'preparando' else 'enviado' end into v_status from order_items where order_id=v_order_id;
  update orders set status=v_status where id=v_order_id and status <> 'cancelado';
  return null;
end $$;
