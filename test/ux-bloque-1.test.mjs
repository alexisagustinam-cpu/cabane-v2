import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("waiter is notified when one of the orders turns ready", () => {
  assert.match(client, /function notifyOrderReady\(o: Order\)/);
  assert.match(client, /before\.status!=="listo" && p\.new\.status==="listo"\) notifyOrderReady/);
});

test("paid but unreleased tables stay on the waiter map after a realtime update", () => {
  assert.match(client, /tableReleaseReadyRef\.current \? !o\.table_released_at : o\.payment_status !== "paid"/);
  assert.match(client, /\.filter\(stillOnWaiterMap\)/);
});

test("cashier shows change for cash payments", () => {
  assert.match(client, /const cashHelper = \(amount: number\)/);
  assert.match(client, /chargeIntent\?\.method==="efectivo" && cashHelper\(amount\)/);
});

test("removing a cart item can be undone and a round can be repeated", () => {
  assert.match(client, /label: "Deshacer"/);
  assert.match(client, /function repeatOrder\(o: Order\)/);
  assert.match(client, /Repetir ronda/);
});

test("free tables collapse on phones and numbers are tabular", () => {
  assert.match(client, /className=\{`mesa-card\$\{libre\?" is-free":""\}`\}/);
  assert.match(css, /\.mesa-card\.is-free \{ order: 2; \}/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
});
