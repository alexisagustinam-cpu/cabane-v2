-- ============================================================
-- FASE 20 — Tiempos de cocina y barra.
--
-- Cada producto de un pedido guarda tres horas:
--   sent_at    → cuándo llegó a cocina/barra
--   started_at → cuándo lo marcaron "preparando" (si lo marcaron)
--   ready_at   → cuándo lo marcaron "listo"
-- Con eso Admin → Tiempos muestra cuánto tardan, por estación y por producto.
--
-- Las horas las pone la BASE DE DATOS (trigger), no la app: funciona igual desde
-- cualquier teléfono/tablet, al marcar producto por producto o "Marcar cocina lista",
-- y nadie puede escribirlas a mano.
--   · Si desmarcan un "listo" por error, se borra ready_at.
--   · Si cambian el producto (Fase 19), el reemplazo empieza a contar desde cero.
--   · Los pedidos anteriores a esta fase quedan sin horas (no hay historial que recuperar).
--
-- Ejecutar COMPLETO en Supabase → SQL Editor. Idempotente.
-- Compatible con la app anterior: solo agrega columnas y un trigger.
-- ============================================================

-- Sin "default": las filas viejas quedan en null (no inventar tiempos).
alter table order_items add column if not exists sent_at timestamptz;
alter table order_items add column if not exists started_at timestamptz;
alter table order_items add column if not exists ready_at timestamptz;

create index if not exists order_items_sent_at_idx on order_items (sent_at);

create or replace function public.order_items_track_times()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.sent_at    := now();
    new.started_at := case when new.item_status in ('preparando','listo') then now() end;
    new.ready_at   := case when new.item_status = 'listo' then now() end;
    return new;
  end if;

  -- Nadie escribe las horas a mano: se parte de las que ya tenía la fila.
  new.sent_at    := old.sent_at;
  new.started_at := old.started_at;
  new.ready_at   := old.ready_at;

  if new.item_status = 'enviado'
     and (old.item_status is distinct from 'enviado' or new.product_id is distinct from old.product_id) then
    -- Vuelve a empezar (cambio de producto): cuenta desde ahora.
    new.sent_at := now(); new.started_at := null; new.ready_at := null;
  elsif new.item_status = 'preparando' and old.item_status is distinct from 'preparando' then
    new.started_at := coalesce(old.started_at, now());
    new.ready_at   := null;   -- si desmarcaron un "listo"
  elsif new.item_status = 'listo' and old.item_status is distinct from 'listo' then
    new.ready_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists order_items_track_times on order_items;
create trigger order_items_track_times
  before insert or update on order_items
  for each row execute function public.order_items_track_times();
