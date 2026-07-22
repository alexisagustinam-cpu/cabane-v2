-- ============================================================
-- FASE 6b — Rellenar profiles.email con el email real de Auth
-- para los usuarios que se crearon antes de que /api/admin/users
-- guardara el email en profiles. Ejecutar una sola vez.
-- ============================================================

update profiles set email = (select email from auth.users u where u.id = profiles.id)
where profiles.email is null;
