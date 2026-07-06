-- ============================================================
-- FASE 4 — Control de gastos y gastos fijos
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- Requiere haber corrido fase1-seguridad.sql (usa my_role()).
-- ============================================================

-- Gastos variables: compras, insumos, reparaciones, etc.
create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  description  text not null,
  amount       numeric not null check (amount > 0),
  expense_date date not null default current_date,
  created_by   uuid references profiles(id) on delete set null,
  creator_name text,
  created_at   timestamptz not null default now()
);

-- Gastos fijos mensuales: alquiler, servicios, sueldos…
-- Se suman automáticamente en el reporte mensual mientras estén activos.
create table if not exists fixed_expenses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null,
  amount     numeric not null check (amount > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table expenses       enable row level security;
alter table fixed_expenses enable row level security;

-- Solo el admin maneja el dinero
drop policy if exists expenses_all on expenses;
create policy expenses_all on expenses for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

drop policy if exists fixed_expenses_all on fixed_expenses;
create policy fixed_expenses_all on fixed_expenses for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
