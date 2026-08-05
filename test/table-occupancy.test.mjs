import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("physical tables remain occupied after payment until explicitly released", () => {
  assert.match(client, /table_released_at/);
  assert.match(client, /function releaseTable\(tableLabel: string\)/);
  assert.match(client, /Pagada · ocupada/);
  assert.match(client, /Liberar mesa/);
  assert.match(client, /is\("table_released_at",null\)/);
});

test("takeaway and delivery are not described as occupied tables", () => {
  assert.match(client, /const isPhysicalTable = !isLlevar && !isDelivery/);
  assert.doesNotMatch(client, /Se puede cobrar antes de terminar la preparación/);
});

test("paid occupied tables do not render a preparation timer from historical order creation", () => {
  assert.match(client, /!allPaid && oldest/);
});
