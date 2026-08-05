import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const migrationPath = new URL("../supabase/fase12-pago-independiente.sql", import.meta.url);

test("payment is a lifecycle independent from fulfillment in the client", () => {
  assert.match(client, /type FulfillmentStatus = "enviado" \| "preparando" \| "listo" \| "cancelado"/);
  assert.match(client, /type PaymentStatus = "pending" \| "paid"/);
  assert.match(client, /payment_status: PaymentStatus/);
  assert.match(client, /const canPay = paymentSchemaReady && o\.payment_status==="pending" && !hasPartial/);
  assert.match(client, /const canPayPerPerson = paymentSchemaReady && o\.payment_status==="pending"/);
  assert.match(client, /pendingOrders.length>1 && !pendingOrders\.some/);
  assert.match(client, /className="payment-method-grid"/);
  assert.match(client, /Pagado · en preparación/);
  assert.match(client, /Pagado · listo para entregar/);
  assert.doesNotMatch(client, /payOrder[\s\S]{0,1800}update\(\{status:\"pagado"\}\)/);
});

test("missing Fase 12 blocks payment safely while retaining a preview-compatible cashier", () => {
  assert.match(client, /ensurePaymentSchema/);
  assert.match(client, /Se requiere la migración Fase 12 \(Pago independiente\)/);
  assert.match(client, /Vista previa segura: no se puede cobrar hasta aplicar Fase 12/);
  assert.doesNotMatch(client, /Fallback: marcar pagado/);
});

test("paid fulfillment status renders safely until Fase 12 migrates it", () => {
  assert.match(client, /const colors = m\[s\] \|\| m\.listo/);
});

test("waiter keeps physical tables visible until explicit release", () => {
  assert.match(client, /query\.is\("table_released_at",null\)/);
  assert.match(client, /tableReleaseSchemaReady/);
  assert.match(client, /!o\.table_released_at/);
  assert.match(client, /Liberar mesa/);
});

test("Fase 12 migration is present, idempotent, migrates legacy data, and preserves Fase 11 aggregation", () => {
  assert.ok(existsSync(migrationPath), "missing Fase 12 migration");
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /add column if not exists payment_status text/);
  assert.match(migration, /when o\.status = 'pagado' then 'paid'/);
  assert.match(migration, /exists \(select 1 from payments p where p\.order_id = o\.id\) then 'paid'/);
  assert.match(migration, /check \(payment_status in \('pending','paid'\)\)/);
  assert.match(migration, /update orders set status = 'listo' where status = 'pagado'/);
  assert.match(migration, /v_order\.payment_status = 'paid'/);
  assert.match(migration, /update orders set payment_status = 'paid'/);
  assert.doesNotMatch(migration, /update orders set status = 'pagado'/);
  assert.match(migration, /status <> 'cancelado'/);
});
