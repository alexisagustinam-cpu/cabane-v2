import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/fase11-barra-cocina.sql", import.meta.url), "utf8");

test("defines Barra as a first-class role and screen", () => {
  assert.match(client, /type Role = "waiter" \| "kitchen" \| "bar" \| "cashier" \| "admin"/);
  assert.match(client, /bar:\["bar"\]/);
  assert.match(client, /bar:"Barra"/);
});

test("waiter validates fase 11 before creating an order and persists item station state", () => {
  assert.match(client, /ensurePreparationSchema\(\)/);
  assert.match(client, /station:stationForCategory\(i\.category\), item_status:"enviado"/);
  assert.match(client, /Se requiere la migración Fase 11/);
});

test("station board filters its cards and updates only its own order items", () => {
  assert.match(client, /filter\(i=>i\.station===station\)/);
  assert.match(client, /from\("order_items"\)\.update\(\{item_status:status\}\)\.eq\("id",itemId\)\.eq\("station",station\)/);
  assert.doesNotMatch(client, /async function stationItemUpdate[\s\S]*?from\("orders"\)\.update\(\{status[\s\S]*?async function loadInventory/);
});

test("menu uses compact tile controls for every visible product", () => {
  assert.match(client, /className="product-grid product-tile-grid"/);
  assert.match(client, /className="product-list-item product-tile"/);
});

test("migration assigns bar categories, defaults unknown categories to kitchen, aggregates orders and scopes RLS", () => {
  assert.match(migration, /'Bebidas', 'Cafés', 'Postres'/);
  assert.match(migration, /from products p, orders o\s+where o\.id = oi\.order_id\s+and oi\.product_id = p\.id/);
  assert.doesNotMatch(migration, /join orders o on o\.id = oi\.order_id/);
  assert.match(migration, /else 'kitchen'/);
  assert.match(migration, /item_status = 'listo'/);
  assert.match(migration, /has_role\('bar'\)/);
  assert.match(migration, /order_items_update_station/);
});
