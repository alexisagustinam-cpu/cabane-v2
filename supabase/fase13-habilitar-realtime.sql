-- ============================================================
-- FASE 13 — Habilita Realtime en la tabla orders.
-- Causa raíz de: cocina no se actualizaba sola con pedidos nuevos, el
-- sonido no sonaba, y el mapa de mesas de mesero/caja tampoco se
-- refrescaba solo. El código ya escuchaba estos eventos (postgres_changes)
-- desde hace rato, pero nunca funcionaron porque la tabla nunca se agregó
-- a la publicación "supabase_realtime" — es un ajuste aparte de RLS que
-- nunca se hizo. No cambia permisos ni políticas, solo prende Realtime.
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
