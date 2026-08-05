-- ============================================================
-- FASE 11 — Preparación por estación (Cocina / Barra)
-- Ejecutar después de fase 10. Este archivo NO se ejecuta desde la app.
--
-- La fuente de clasificación es products.category al crear/backfillear:
-- Barra: Bebidas, Cafés, Postres. Cualquier categoría no reconocida se
-- manda explícitamente a Cocina como opción segura, nunca se omite.
-- ============================================================

-- 1. El nuevo rol se incorpora a la validación multi-rol existente.
alter table profiles drop constraint if exists profiles_roles_valid;
alter table profiles add constraint profiles_roles_valid
  check (roles <@ array['waiter','kitchen','bar','cashier','admin']::text[] and cardinality(roles) > 0);

-- 2. El trigger de Auth de fase 10 debe reconocer Barra en instalaciones ya existentes.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_roles text[]; v_primary_role text;
begin
  select coalesce(array_agg(value), array[]::text[]) into v_roles
  from jsonb_array_elements_text(case when jsonb_typeof(new.raw_user_meta_data->'roles') = 'array' then new.raw_user_meta_data->'roles' else '[]'::jsonb end);
  if cardinality(v_roles) = 0 then
    v_primary_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'waiter');
    v_roles := array[v_primary_role];
  end if;
  if not (v_roles <@ array['waiter','kitchen','bar','cashier','admin']::text[]) then v_roles := array['waiter']; end if;
  v_primary_role := v_roles[1];
  insert into public.profiles (id, name, role, roles, email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)), v_primary_role, v_roles, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- 3. Estado y estación por línea de pedido.
alter table order_items add column if not exists station text;
alter table order_items add column if not exists item_status text;

-- Backfill coherente: los pedidos cerrados se conservan listos; los abiertos
-- preservan el significado previo de orders.status en cada uno de sus ítems.
update order_items oi
set station = case
  when p.category in ('Bebidas', 'Cafés', 'Postres') then 'bar'
  else 'kitchen'
end,
item_status = case o.status
  when 'listo' then 'listo'
  when 'preparando' then 'preparando'
  when 'pagado' then 'listo'
  when 'cancelado' then 'listo'
  else 'enviado'
end
from products p, orders o
where o.id = oi.order_id
  and oi.product_id = p.id
  and (oi.station is null or oi.item_status is null);

-- Productos eliminados o líneas históricas sin producto también son Cocina por
-- defecto seguro. No se toca el estado de pedidos cerrados.
update order_items oi
set station = coalesce(oi.station, 'kitchen'),
    item_status = coalesce(oi.item_status, case o.status
      when 'listo' then 'listo'
      when 'preparando' then 'preparando'
      when 'pagado' then 'listo'
      when 'cancelado' then 'listo'
      else 'enviado'
    end)
from orders o
where o.id = oi.order_id and (oi.station is null or oi.item_status is null);

alter table order_items alter column station set not null;
alter table order_items alter column item_status set not null;
alter table order_items alter column station set default 'kitchen';
alter table order_items alter column item_status set default 'enviado';
alter table order_items drop constraint if exists order_items_station_valid;
alter table order_items add constraint order_items_station_valid check (station in ('kitchen','bar'));
alter table order_items drop constraint if exists order_items_item_status_valid;
alter table order_items add constraint order_items_item_status_valid check (item_status in ('enviado','preparando','listo'));

-- 3. La cabecera sigue siendo compatible con Caja: se deriva de TODAS las
-- líneas, así terminar Cocina no puede marcar listo mientras falte Barra.
create or replace function public.sync_order_status_from_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order_id uuid := coalesce(new.order_id, old.order_id); v_status text;
begin
  select case
    when bool_and(item_status = 'listo') then 'listo'
    when bool_or(item_status in ('preparando','listo')) then 'preparando'
    else 'enviado'
  end into v_status
  from order_items where order_id = v_order_id;
  update orders set status = v_status
    where id = v_order_id and status <> 'cancelado'; -- Fase 12: pago no bloquea preparación
  return null;
end;
$$;

drop trigger if exists order_items_sync_order_status on order_items;
create trigger order_items_sync_order_status
  after insert or update of item_status on order_items
  for each row execute function public.sync_order_status_from_items();

-- 4. RLS: cada estación puede leer pedidos, pero solo cambia sus propias líneas.
-- Se elimina el update general heredado de fase 6 para impedir cambios de
-- cabecera que puedan sobrescribir el agregado por ítems.
drop policy if exists orders_update on orders;
create policy orders_update on orders for update to authenticated
  using (has_role('cashier') or has_role('admin'))
  with check (has_role('cashier') or has_role('admin'));

drop policy if exists order_items_update_station on order_items;
create policy order_items_update_station on order_items for update to authenticated
  using (
    has_role('admin')
    or (station = 'kitchen' and has_role('kitchen'))
    or (station = 'bar' and has_role('bar'))
  )
  with check (
    has_role('admin')
    or (station = 'kitchen' and has_role('kitchen'))
    or (station = 'bar' and has_role('bar'))
  );

-- Las líneas nuevas siempre las crean mesero/admin, ya con estación y estado.
drop policy if exists order_items_insert on order_items;
create policy order_items_insert on order_items for insert to authenticated
  with check (has_role('waiter') or has_role('admin'));
