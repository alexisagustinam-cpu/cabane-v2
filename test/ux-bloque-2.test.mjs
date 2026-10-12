import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("kitchen board groups orders into Nuevos and Preparando keeping the original card size", () => {
  assert.match(client, /className="kds-cols"/);
  assert.match(client, /\["Nuevos",nuevos,RED\],\["Preparando",preparando,GOLD\]/);
  // Mismo ancho de tarjeta que antes: cuadrícula de mínimo 290 px.
  assert.match(css, /\.kds-grid, \.kds-col-list \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(290px, 1fr\)\)/);
});

test("each kitchen line can be marked ready on its own", () => {
  assert.match(client, /async function toggleItemReady\(order: Order, item: OrderItem\)/);
  assert.match(client, /from\("order_items"\)\.update\(\{item_status:next\}\)\.eq\("id",item\.id\)/);
});

test("orders created without internet are queued and sent later with the same client_ref", () => {
  assert.match(client, /if \(!navigator\.onLine\) \{\s*enqueueOrder\(q\)/);
  assert.match(client, /const flushOutbox = useCallback/);
  assert.match(client, /window\.addEventListener\("online", onOnline\)/);
  assert.match(client, /client_ref:q\.clientRef/);
});

test("cashier can share or print a receipt", () => {
  assert.match(client, /function receiptText\(order: Order, pays: Payment\[\]\)/);
  assert.match(client, /wa\.me\/\?text=/);
  assert.match(client, /window\.print\(\)/);
  assert.match(css, /@media print/);
});

test("cash closure can be counted by bills and coins", () => {
  assert.match(client, /const CASH_DENOMS = \[/);
  assert.match(client, /setClosureCash\(CASH_DENOMS\.reduce/);
});
