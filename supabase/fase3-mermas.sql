-- ============================================================
-- FASE 3 — Mermas: productos dados de baja (quemados, caídos,
-- mal preparados, etc.) que no se cobraron.
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- ============================================================

create table if not exists waste (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid references products(id) on delete set null,
  product_name  text not null,
  quantity      numeric not null check (quantity > 0),
  unit_price    numeric not null default 0,   -- precio de venta al momento de la baja
  reason        text not null,
  notes         text,
  reported_by   uuid references profiles(id) on delete set null,
  reporter_name text,
  created_at    timestamptz not null default now()
);

alter table waste enable row level security;

drop policy if exists waste_select on waste;
create policy waste_select on waste for select to authenticated
  using (my_role() in ('kitchen','admin'));
drop policy if exists waste_insert on waste;
create policy waste_insert on waste for insert to authenticated
  with check (my_role() in ('kitchen','admin'));
drop policy if exists waste_delete on waste;
create policy waste_delete on waste for delete to authenticated
  using (my_role() = 'admin');

-- Registra la baja y descuenta el inventario (según la receta del
-- producto) en UNA transacción.
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
  v_role    text;
  v_name    text;
  v_product products%rowtype;
begin
  select role, name into v_role, v_name from profiles where id = auth.uid();
  if v_role not in ('kitchen','admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo cocina o admin pueden dar de baja');
  end if;
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
