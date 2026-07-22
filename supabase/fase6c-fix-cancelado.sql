-- ============================================================
-- FASE 6c — Bugfix: la tabla orders nunca aceptó el estado
-- 'cancelado' (el check constraint se quedó desactualizado).
-- Por eso el botón "Cancelar" nunca funcionó en producción.
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- ============================================================

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('enviado','preparando','listo','pagado','cancelado'));
