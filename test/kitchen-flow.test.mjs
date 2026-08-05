import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("station loader fetches only unfinished orders joined to its own station", () => {
  assert.match(client, /select\("\*, order_items!inner\(\*\)"\)\.eq\("order_items\.station",station\)\.in\("order_items\.item_status",\["enviado","preparando"\]\)\.in\("status",\["enviado","preparando"\]\)/);
});

test("realtime reloads the station-filtered board after item changes", () => {
  assert.match(client, /table:"order_items"\},\(\)=>\{ loadKitchen\(station\); \}/);
});

test("an order update is scoped to its station and never falls back to an order status update", () => {
  assert.match(client, /from\("order_items"\)\.update\(\{item_status:status\}\)\.eq\("order_id",orderId\)\.eq\("station",station\)/);
  assert.match(client, /Una estación trabaja por pedido/);
});

test("cashier receives active fulfillment states while payment remains independent", () => {
  assert.match(client, /\["enviado","preparando","listo"\]/);
  assert.match(client, /payment_status==="pending"/);
  assert.match(client, /const canPay = paymentSchemaReady && o\.payment_status==="pending" && !hasPartial/);
});
