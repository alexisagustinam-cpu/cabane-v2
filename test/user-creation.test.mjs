import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/fase10-fix-user-trigger.sql", import.meta.url), "utf8");

test("admin user creation sends role metadata required by the database trigger", () => {
  assert.match(route, /user_metadata:\s*\{\s*name:\s*cleanName,\s*role:\s*roles\[0\],\s*roles,\s*email:\s*cleanEmail\s*\}/);
  assert.match(route, /password\.length < 6/);
});

test("profile failure rolls back the newly created auth account", () => {
  assert.match(route, /if \(pErr\)[\s\S]*deleteUser\(data\.user\.id\)/);
});

test("user form communicates and enforces Supabase password minimum", () => {
  assert.match(client, /placeholder="Contraseña inicial \(mín\. 6\)"/);
  assert.match(client, /minLength=\{6\}/);
  assert.match(client, /newUser\.password\.length<6/);
});

test("auth trigger creates a non-empty roles array in profiles", () => {
  assert.match(migration, /create or replace function public\.handle_new_user\(\)/i);
  assert.match(migration, /insert into public\.profiles\s*\(id, name, role, roles, email\)/i);
  assert.match(migration, /cardinality\(v_roles\) = 0/i);
  assert.match(migration, /array\['waiter'\]/i);
});

test("migration preserves the auth trigger and is safe to rerun", () => {
  assert.match(migration, /drop trigger if exists on_auth_user_created on auth\.users/i);
  assert.match(migration, /create trigger on_auth_user_created/i);
  assert.match(migration, /on conflict \(id\) do update/i);
});
