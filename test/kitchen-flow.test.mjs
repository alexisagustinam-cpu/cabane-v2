import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("kitchen only loads new and preparing orders", () => {
  assert.match(client, /setKLoading\(true\)[\s\S]*?\.in\("status",\["enviado","preparando"\]\)/);
});

test("realtime removes ready orders from kitchen", () => {
  assert.match(client, /filter\(\(o:Order\)=>\["enviado","preparando"\]\.includes\(o\.status\)\)/);
});

test("marking ready removes the card after the database update succeeds", () => {
  assert.match(client, /if \(status==="listo"\) setKOrders\(prev=>prev\.filter\(o=>o\.id!==id\)\)/);
});

test("kitchen no longer exposes ready or return controls", () => {
  assert.doesNotMatch(client, /label:"Listos",status:"listo"/);
  assert.doesNotMatch(client, />Regresar</);
});

test("cashier still receives ready orders and enables payment", () => {
  assert.match(client, /\["enviado","preparando","listo"\]/);
  assert.match(client, /const canPay = o\.status==="listo"/);
});
