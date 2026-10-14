import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const ordersRoute = readFileSync(new URL("../app/api/admin/orders/route.ts", import.meta.url), "utf8");
const safeMode = readFileSync(new URL("../app/ui/safe-mode.ts", import.meta.url), "utf8");
const fase16 = readFileSync(new URL("../supabase/fase18-seguridad-cobros.sql", import.meta.url), "utf8");
const obsolete = readFileSync(new URL("../supabase/fase12-fix-doble-cobro.sql", import.meta.url), "utf8");

test("annulling a paid order checks payment_status, not the removed 'pagado' status", () => {
  const annul = client.slice(client.indexOf("function annulOrder"), client.indexOf("function loadHistory"));
  assert.match(annul, /select\("payment_status"\)/);
  assert.match(annul, /order\.payment_status !== "paid"/);
  assert.doesNotMatch(annul, /"pagado"/);
});

test("reports exclude annulled (cancelled) orders even if they were paid", () => {
  const stats = client.slice(client.indexOf("async function loadAdminStats"), client.indexOf("async function loadPrepTimes"));
  assert.equal((stats.match(/neq\("(orders\.)?status","cancelado"\)/g) || []).length, 3);
});

test("deleting paid orders restores inventory using payment_status", () => {
  assert.match(ordersRoute, /\.eq\("payment_status", "paid"\)/);
  assert.doesNotMatch(ordersRoute, /\.eq\("status", "pagado"\)/);
});

test("kitchen shows the oldest (most urgent) order first", () => {
  assert.match(client, /\.in\("status",\["enviado","preparando"\]\)\.order\("created_at",\{ascending:true\}\)/);
});

test("releasing a table never reports success when RLS updated zero rows", () => {
  const release = client.slice(client.indexOf("async function releaseTable"), client.indexOf("const mesaOrdersOf"));
  assert.match(release, /rpc\("release_table"/);
  assert.match(release, /\.select\("id"\)/);
  assert.match(release, /if \(!released\)/);
});

test("history counters count paid orders by payment_status", () => {
  assert.match(client, /pagado: histOrders\.filter\(o=>o\.payment_status==="paid" && o\.status!=="cancelado"\)\.length/);
});

test("charging is a two-step action: pick method, then confirm", () => {
  const popup = client.slice(client.indexOf("POPUP DE MESA (CAJA)"), client.indexOf("MODAL MOVER PEDIDO"));
  assert.match(popup, /onClick=\{\(\)=>pickMethod\(o\.id, m\)\}/);
  assert.doesNotMatch(popup, /onClick=\{\(\)=>cobrar\(o\.id,m,o\.total\)\}/);
  assert.match(popup, /onClick=\{\(\)=>pickMethod\("__mesa__", m\)\}/);
});

test("localhost safe mode blocks writes to the production database", () => {
  assert.match(client, /global: \{ fetch: safeFetch \}/);
  assert.match(safeMode, /method === "GET" \|\| method === "HEAD"/);
  assert.match(safeMode, /h === "localhost"/);
  assert.match(client, /if \(isSafeMode\(\)\) \{/); // adminFetch no llama a /api/admin
});

test("fase 18 lets waiters release tables and makes the database own prices and totals", () => {
  assert.match(fase16, /create or replace function public\.release_table\(p_table text\)/);
  assert.match(fase16, /has_role\('waiter'\) or has_role\('cashier'\) or has_role\('admin'\)/);
  assert.match(fase16, /before insert on order_items/);
  assert.match(fase16, /current_user = 'authenticated' and not has_role\('admin'\)/);
  assert.match(fase16, /if not \(has_role\('cashier'\) or has_role\('admin'\)\)/);
  assert.match(fase16, /charger_name/);
});

test("the obsolete double-charge migration is flagged so nobody reruns it", () => {
  assert.match(obsolete, /^-- ⚠️ OBSOLETO — NO EJECUTAR/);
});

test("copy uses Ecuadorian Spanish, not Argentine voseo", () => {
  const menu = readFileSync(new URL("../app/menu/MenuClient.tsx", import.meta.url), "utf8");
  for (const word of ["Activá", "Anotá", "Elegí", "Podés", "Completá", "Seleccioná", "Deslizá", "usá"]) {
    assert.ok(!client.includes(word) && !menu.includes(word), word);
  }
});
