-- ============================================================
-- FASE 11 — Pago dividido por persona/consumo.
-- No reinterpreta pagos históricos: es una tabla y una RPC nuevas,
-- separadas de pay_order (que sigue intacta para el cobro completo
-- por método, usado hoy en "Efectivo/Tarjeta/Transferencia"/"Dividir").
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- Requiere haber corrido fase1, fase6 y fase7.
-- ============================================================

create table if not exists payment_item_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  payment_id uuid not null references payments(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  person_name text,
  created_at timestamptz not null default now()
);

create index if not exists payment_item_allocations_order_id_idx on payment_item_allocations(order_id);
create index if not exists payment_item_allocations_payment_id_idx on payment_item_allocations(payment_id);
create index if not exists payment_item_allocations_order_item_id_idx on payment_item_allocations(order_item_id);

alter table payment_item_allocations enable row level security;

-- Solo lectura para caja/admin — la escritura pasa siempre por la RPC
-- (security definer, más abajo), nunca directo desde el cliente, para
-- que el cierre de la orden y el descuento de inventario sean atómicos.
drop policy if exists payment_item_allocations_select on payment_item_allocations;
create policy payment_item_allocations_select on payment_item_allocations for select to authenticated
  using (has_role('cashier') or has_role('admin'));

drop function if exists public.record_item_payment(uuid, text, jsonb, text);

create or replace function public.record_item_payment(
  p_order_id uuid,
  p_method text,
  p_allocations jsonb,   -- [{ "order_item_id": uuid, "quantity": numeric }, ...]
  p_person_name text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item  order_items%rowtype;
  v_name  text;
  v_payment_id uuid;
  v_amount numeric := 0;
  v_already_paid numeric;
  v_pending numeric;
  v_remaining int;
  alloc jsonb;
begin
  if not (has_role('cashier') or has_role('admin')) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado para cobrar');
  end if;
  if p_method not in ('efectivo','tarjeta','transferencia') then
    return jsonb_build_object('ok', false, 'error', 'Método de pago inválido');
  end if;
  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Debe seleccionar al menos un producto');
  end if;

  select name into v_name from profiles where id = auth.uid();

  -- Bloquea la orden: si dos cajas cobran a la vez, la segunda espera y ve el estado real
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

  -- Bloquea también los items del pedido, para que dos cobros simultáneos
  -- no puedan asignar la misma unidad dos veces.
  perform 1 from order_items where order_id = p_order_id for update;

  -- Valida cada línea contra lo realmente pendiente y calcula el monto
  -- desde el precio guardado en el servidor (nunca confía en un monto del cliente).
  for alloc in select * from jsonb_array_elements(p_allocations) loop
    select * into v_item from order_items
      where id = (alloc->>'order_item_id')::uuid and order_id = p_order_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Ese producto no pertenece a este pedido');
    end if;
    if (alloc->>'quantity') is null or (alloc->>'quantity')::numeric <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Cantidad inválida');
    end if;

    select coalesce(sum(quantity),0) into v_already_paid
      from payment_item_allocations where order_item_id = v_item.id;
    v_pending := v_item.quantity - v_already_paid;
    if (alloc->>'quantity')::numeric > v_pending + 0.0001 then
      return jsonb_build_object('ok', false, 'error',
        format('%s: solo quedan %s unidad(es) pendientes', v_item.product_name, v_pending));
    end if;

    v_amount := v_amount + (alloc->>'quantity')::numeric * v_item.unit_price;
  end loop;

  insert into payments (order_id, method, amount, charged_by, charger_name)
  values (p_order_id, p_method, v_amount, auth.uid(), v_name)
  returning id into v_payment_id;

  for alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into payment_item_allocations (order_id, payment_id, order_item_id, quantity, person_name)
    values (p_order_id, v_payment_id, (alloc->>'order_item_id')::uuid, (alloc->>'quantity')::numeric, nullif(trim(p_person_name),''));
  end loop;

  -- ¿Quedan unidades sin cobrar en este pedido?
  select count(*) into v_remaining
    from order_items oi
    where oi.order_id = p_order_id
      and oi.quantity > coalesce((select sum(pia.quantity) from payment_item_allocations pia where pia.order_item_id = oi.id), 0) + 0.0001;

  if v_remaining = 0 then
    update orders set status = 'pagado' where id = p_order_id;

    -- Descuento de inventario según recetas — una sola vez, al cerrar del todo
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'amount', v_amount,
    'order_paid', v_remaining = 0,
    'pending_items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'order_item_id', oi.id,
        'product_name', oi.product_name,
        'quantity', oi.quantity,
        'paid', coalesce(p.paid,0),
        'pending', oi.quantity - coalesce(p.paid,0)
      )), '[]'::jsonb)
      from order_items oi
      left join (
        select order_item_id, sum(quantity) as paid
        from payment_item_allocations
        group by order_item_id
      ) p on p.order_item_id = oi.id
      where oi.order_id = p_order_id
    )
  );
end
$$;

revoke execute on function public.record_item_payment(uuid, text, jsonb, text) from anon;
grant execute on function public.record_item_payment(uuid, text, jsonb, text) to authenticated;
