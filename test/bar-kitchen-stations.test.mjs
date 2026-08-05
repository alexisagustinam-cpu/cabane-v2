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

test("station board works by whole order within its own station", () => {
  assert.match(client, /\.eq\("order_items\.station",station\)\.in\("order_items\.item_status",\["enviado","preparando"\]\)/);
  assert.match(client, /function stationOrderUpdate\(orderId: string, station: Station, status: OrderItem\["item_status"\]\)/);
  assert.match(client, /from\("order_items"\)\.update\(\{item_status:status\}\)\.eq\("order_id",orderId\)\.eq\("station",station\)/);
  assert.match(client, /stationOrderUpdate\(o\.id,station/);
  assert.doesNotMatch(client, /stationItemUpdate/);
});

test("menu uses dense product rows with compact quantity controls and calm motion", () => {
  assert.match(client, /className="product-grid product-row-grid"/);
  assert.match(client, /className="product-list-item product-row"/);
  assert.match(client, /Añadir/);
  assert.doesNotMatch(client, /aspect-ratio:1\/1/);
  assert.doesNotMatch(client, /button:not\(:disabled\):active\{transform:scale/);
  assert.match(client, /prefers-reduced-motion:reduce/);
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
