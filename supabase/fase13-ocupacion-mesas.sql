-- ============================================================
-- FASE 13 — Ocupación de mesas independiente de pago/preparación
-- Ejecutar DESPUÉS de Fase 12. Idempotente.
-- Una mesa física no queda disponible al cobrar: se libera
-- explícitamente cuando el cliente se retira.
-- ============================================================

alter table public.orders
  add column if not exists table_released_at timestamptz;

create index if not exists orders_active_table_occupancy_idx
  on public.orders (table_label, created_at)
  where table_released_at is null and status <> 'cancelado';

comment on column public.orders.table_released_at is
  'Marca operativa: la mesa física fue liberada después de pago/entrega. No altera payment_status ni status de preparación.';
