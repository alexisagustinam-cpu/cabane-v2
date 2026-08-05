import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("bar completes its station in one touch while kitchen retains preparation", () => {
  assert.match(client, /const stationCompletesDirectly = station==="bar"/);
  assert.match(client, /stationOrderUpdate\(o\.id,station,stationCompletesDirectly\?"listo"/);
  assert.match(client, /Marcar barra lista/);
  assert.match(client, /Marcar cocina preparando/);
});
