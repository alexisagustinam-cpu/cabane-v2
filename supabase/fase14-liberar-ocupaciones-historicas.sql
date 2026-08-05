-- ============================================================
-- FASE 14 — Saneamiento único de ocupaciones históricas
-- Ejecutar DESPUÉS de Fase 13.
--
-- Fase 13 añadió table_released_at a pedidos ya existentes.
-- Esos pedidos heredados quedaron en NULL y Mesero los interpretó
-- como mesas actualmente ocupadas, acumulando cuentas antiguas.
--
-- Seguridad: solo libera pedidos PAGADOS y LISTOS de días operativos
-- anteriores en Ecuador. No toca pedidos de hoy, pendientes,
-- en preparación ni cancelados.
-- ============================================================

update public.orders
set table_released_at = now()
where table_released_at is null
  and payment_status = 'paid'
  and status = 'listo'
  and created_at < ((now() at time zone 'America/Guayaquil')::date at time zone 'America/Guayaquil');
