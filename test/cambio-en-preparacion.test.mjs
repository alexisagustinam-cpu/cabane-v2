import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/fase19-cambiar-producto-en-preparacion.sql", import.meta.url), "utf8");

test("a product can be swapped while the order is new or in preparation, but not once that item is ready", () => {
  assert.match(client, /const canSwap = \(o: Order, i: OrderItem\) =>\s*\(o\.status==="enviado" \|\| o\.status==="preparando"\) && o\.payment_status!=="paid" && i\.item_status!=="listo";/);
  assert.equal((client.match(/\{canSwap\(o,i\) && \(/g) || []).length, 2); // mesero y cocina
  assert.doesNotMatch(client, /\{o\.status==="enviado" && \(\s*<button title="No hay ingredientes/);
});

test("fase 19 allows enviado/preparando, blocks ready items, paid and partially paid orders", () => {
  assert.match(sql, /if v_order\.status not in \('enviado','preparando'\) then/);
  assert.match(sql, /if v_item\.item_status = 'listo' then/);
  assert.match(sql, /if v_order\.payment_status = 'paid' then/);
  assert.match(sql, /from payment_item_allocations where order_id = p_order_id/);
  assert.match(sql, /'in_preparation', v_was_preparing/);
});

test("swapping an item that was being prepared reminds to register the waste", () => {
  assert.match(client, /Si el original se desperdició, regístralo en "Dar de baja"/);
  assert.match(client, /label:"Dar de baja"/);
});
