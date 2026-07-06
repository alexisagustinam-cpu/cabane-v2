-- ============================================================
-- FASE 5 — Mesas y categorías gestionables + cierre de caja
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
-- Requiere haber corrido fase1-seguridad.sql (usa my_role()).
-- ============================================================

-- 1. Mesas gestionables desde el admin
create table if not exists tables (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Categorías de productos gestionables desde el admin
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

-- 3. Cierre de caja diario (arqueo)
create table if not exists cash_closures (
  id                uuid primary key default gen_random_uuid(),
  closure_date      date not null unique,
  expected_cash     numeric not null default 0,  -- efectivo según el sistema
  counted_cash      numeric not null default 0,  -- efectivo contado físicamente
  difference        numeric not null default 0,
  expected_card     numeric not null default 0,
  expected_transfer numeric not null default 0,
  total_orders      int not null default 0,
  notes             text,
  closed_by         uuid references profiles(id) on delete set null,
  closer_name       text,
  created_at        timestamptz not null default now()
);

alter table tables        enable row level security;
alter table categories    enable row level security;
alter table cash_closures enable row level security;

-- tables/categories: todos leen, solo admin escribe
drop policy if exists tables_select on tables;
create policy tables_select on tables for select to authenticated using (true);
drop policy if exists tables_write on tables;
create policy tables_write on tables for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

drop policy if exists categories_select on categories;
create policy categories_select on categories for select to authenticated using (true);
drop policy if exists categories_write on categories;
create policy categories_write on categories for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- cierres: caja y admin registran/leen; solo admin borra
drop policy if exists closures_select on cash_closures;
create policy closures_select on cash_closures for select to authenticated
  using (my_role() in ('cashier','admin'));
drop policy if exists closures_insert on cash_closures;
create policy closures_insert on cash_closures for insert to authenticated
  with check (my_role() in ('cashier','admin'));
drop policy if exists closures_update on cash_closures;
create policy closures_update on cash_closures for update to authenticated
  using (my_role() in ('cashier','admin'));
drop policy if exists closures_delete on cash_closures;
create policy closures_delete on cash_closures for delete to authenticated
  using (my_role() = 'admin');

-- 4. Datos iniciales (solo si las tablas están vacías)
insert into tables (label, sort)
select v.label, v.sort
from (values
  ('Mesa 0',0),('Mesa 1',1),('Mesa 2',2),('Mesa 3',3),('Mesa 4',4),
  ('Mesa 5',5),('Mesa 6',6),('Mesa 7',7),('Mesa 8',8),('Mesa 9',9),
  ('Para llevar',10),('Delivery',11)
) as v(label, sort)
where not exists (select 1 from tables);

insert into categories (name, sort)
select v.name, v.sort
from (values
  ('Sánduches',0),('Desayunos',1),('Clásicos',2),('Ensaladas',3),
  ('Tablitas',4),('Para Compartir',5),('Bebidas',6),('Cafés',7),('Postres',8)
) as v(name, sort)
where not exists (select 1 from categories);
