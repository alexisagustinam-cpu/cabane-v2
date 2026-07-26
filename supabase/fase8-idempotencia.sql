-- ============================================================
-- FASE 8 — Evita pedidos duplicados si se corta la conexión justo
-- al enviar a cocina (la escritura llega al servidor pero la
-- respuesta se pierde, y el mesero reintenta).
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- ============================================================

alter table orders add column if not exists client_ref uuid;

alter table orders drop constraint if exists orders_client_ref_unique;
alter table orders add constraint orders_client_ref_unique unique (client_ref);
