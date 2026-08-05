import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = new URL("../supabase/fase14-liberar-ocupaciones-historicas.sql", import.meta.url);

test("Fase 14 releases only paid and ready table occupancy from prior Ecuador business days", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /update public\.orders/);
  assert.match(sql, /set table_released_at = now\(\)/);
  assert.match(sql, /table_released_at is null/);
  assert.match(sql, /payment_status = 'paid'/);
  assert.match(sql, /status = 'listo'/);
  assert.match(sql, /America\/Guayaquil/);
  assert.match(sql, /created_at < \(\(now\(\) at time zone 'America\/Guayaquil'\)::date at time zone 'America\/Guayaquil'\)/);
});
