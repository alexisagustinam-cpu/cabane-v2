-- ============================================================
-- FASE 9 — Dar de baja un producto directo desde su pedido en
-- cocina (antes solo existía el selector genérico de todo el menú).
-- No cambia el pedido ni lo que se cobra — solo queda registrado
-- de qué pedido vino la merma, para trazabilidad de inventario.
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- Requiere haber corrido fase1, fase3 y fase6.
-- ============================================================

alter table waste add column if not exists order_id uuid references orders(id) on delete set null;

drop function if exists public.register_waste(uuid, numeric, text, text);

create or replace function public.register_waste(
  p_product_id uuid,
  p_quantity   numeric,
  p_reason     text,
  p_notes      text default null,
  p_order_id   uuid default null
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

  insert into waste (product_id, product_name, quantity, unit_price, reason, notes, reported_by, reporter_name, order_id)
  values (p_product_id, v_product.name, p_quantity, coalesce(v_product.price, 0), p_reason, p_notes, auth.uid(), v_name, p_order_id);

  -- El producto dañado ya consumió sus ingredientes
  update ingredients i
  set stock_current = greatest(0, i.stock_current - r.quantity * p_quantity)
  from recipes r
  where r.ingredient_id = i.id and r.product_id = p_product_id;

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.register_waste(uuid, numeric, text, text, uuid) from anon;
grant execute on function public.register_waste(uuid, numeric, text, text, uuid) to authenticated;
