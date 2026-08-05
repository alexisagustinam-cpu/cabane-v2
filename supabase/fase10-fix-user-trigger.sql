-- ============================================================
-- FASE 10 — Reparar creación de usuarios después de multi-rol
-- Ejecutar COMPLETO en Supabase → SQL Editor (idempotente)
--
-- Causa del fallo: fase6 hizo `profiles.roles` obligatorio y no vacío,
-- pero el trigger antiguo solo insertaba `role`; su valor por defecto
-- para `roles` era '{}', que viola profiles_roles_valid.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles text[];
  v_primary_role text;
begin
  -- La API administrativa envía `roles` como arreglo. Para altas desde
  -- otros clientes conservamos compatibilidad con el antiguo `role`.
  select coalesce(array_agg(value), array[]::text[])
    into v_roles
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(new.raw_user_meta_data->'roles') = 'array'
        then new.raw_user_meta_data->'roles'
      else '[]'::jsonb
    end
  );

  if cardinality(v_roles) = 0 then
    v_primary_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'waiter');
    v_roles := array[v_primary_role];
  end if;

  -- Nunca permitir que metadatos externos rompan la creación en Auth.
  if not (v_roles <@ array['waiter','kitchen','bar','cashier','admin']::text[]) then
    v_roles := array['waiter'];
  end if;

  v_primary_role := v_roles[1];

  insert into public.profiles (id, name, role, roles, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    v_primary_role,
    v_roles,
    new.email
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

-- Garantiza que el trigger correcto siga conectado aunque esta migración
-- se ejecute en una instalación donde fue eliminado o renombrado.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
