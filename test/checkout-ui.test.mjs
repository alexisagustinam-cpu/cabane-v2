import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("cashier presents payment methods without repeating the payment action", () => {
  assert.doesNotMatch(client, /Cobrar ahora/);
  assert.match(client, /Método de pago/);
  assert.match(client, /Pago dividido/);
  assert.match(client, /Por consumo/);
  assert.match(client, /className="payment-method-grid"/);
});

test("moving an order is not mixed into payment controls", () => {
  assert.match(client, /className="order-service-actions"/);
});

test("cashier lets staff release a fully paid and ready physical table from its table popup", () => {
  const cashierPopup = client.slice(
    client.indexOf("POPUP DE MESA (CAJA)"),
    client.indexOf("MODAL MOVER PEDIDO")
  );
  assert.match(cashierPopup, /const canReleaseTable/);
  assert.match(cashierPopup, /tableReleaseSchemaReady/);
  assert.match(cashierPopup, /Para liberar mesas falta aplicar Fase 13 en Supabase/);
  assert.match(cashierPopup, /Liberar mesa/);
  assert.match(cashierPopup, /releaseTable\(payModalMesa\)/);
});
