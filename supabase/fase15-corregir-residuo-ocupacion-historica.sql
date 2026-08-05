-- ============================================================
-- FASE 15 — Corrección de residuo horario de Fase 14
-- Ejecutar después de Fase 14.
--
-- Recorre de nuevo solo ocupaciones históricas pagadas/listas,
-- comparando la FECHA LOCAL de cada pedido en Ecuador. Es idempotente:
-- los pedidos ya liberados no se vuelven a tocar.
-- ============================================================

update public.orders
set table_released_at = now()
where table_released_at is null
  and payment_status = 'paid'
  and status = 'listo'
  and (created_at at time zone 'America/Guayaquil')::date < (now() at time zone 'America/Guayaquil')::date;
