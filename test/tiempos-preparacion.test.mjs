import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarize, seriesBy, fmtMin, applyItemTimes, isForgotten, FORGOTTEN_MIN } from "../app/ui/prep-times.ts";

const T0 = new Date("2026-10-14T18:00:00Z").getTime();
const at = m => new Date(T0 + m * 60000).toISOString();
const row = (name, station, sent, ready, started = null, quantity = 1) => ({
  product_name: name, station, quantity, sent_at: sent === null ? null : at(sent), started_at: started === null ? null : at(started), ready_at: ready === null ? null : at(ready),
});
const NOW = new Date(T0 + 5 * 3600000);

test("promedio, mediana y colores por estación (verde ≤10, naranja ≤15, rojo >15)", () => {
  const s = summarize([
    row("Sloppy Joe", "kitchen", 0, 8, 2),
    row("Sloppy Joe", "kitchen", 10, 22, 13),
    row("Blita Cabane", "kitchen", 0, 20, 5),
    row("Limonada", "bar", 0, 3, 1),
  ], NOW);
  assert.equal(s.kitchen.lines, 3);
  assert.equal(Math.round(s.kitchen.avg * 100) / 100, Math.round(((8 + 12 + 20) / 3) * 100) / 100);
  assert.equal(s.kitchen.median, 12);
  assert.deepEqual([s.kitchen.onTime, s.kitchen.mid, s.kitchen.late], [1, 1, 1]);
  assert.equal(s.bar.avg, 3);
  // "Tardan X en empezarlo y Y en prepararlo" (todos pasaron por preparando)
  assert.equal(Math.round(s.kitchen.waitAvg * 100) / 100, Math.round(((2 + 3 + 5) / 3) * 100) / 100);
});

test("productos ordenados del más lento al más rápido, con más rápido/más lento", () => {
  const s = summarize([row("A", "kitchen", 0, 5), row("B", "kitchen", 0, 18), row("B", "kitchen", 0, 10)], NOW);
  assert.deepEqual(s.products.map(p => p.name), ["B", "A"]);
  assert.equal(s.products[0].min, 10);
  assert.equal(s.products[0].max, 18);
});

test("olvidados: más de una hora sin marcar listo no entra al promedio y se cuenta aparte", () => {
  const s = summarize([row("A", "kitchen", 0, 10), row("A", "kitchen", 0, FORGOTTEN_MIN + 15), row("A", "kitchen", 0, null)], NOW);
  assert.equal(s.kitchen.avg, 10);
  assert.equal(s.kitchen.forgotten, 2);
  // Un producto en preparación hace 5 min no es "olvidado": todavía no se mide.
  assert.equal(isForgotten(row("A", "kitchen", 295, null), NOW), false);
});

test("filas sin horas (pedidos de antes de la Fase 20) se ignoran", () => {
  const s = summarize([row("A", "kitchen", null, null)], NOW);
  assert.equal(s.kitchen.lines, 0);
  assert.equal(s.kitchen.avg, null);
  assert.equal(fmtMin(s.kitchen.avg), "—");
});

test("serie por hora para el gráfico", () => {
  const r = seriesBy([row("A", "kitchen", 0, 10), row("A", "kitchen", 30, 50), row("L", "bar", 0, 2)], "kitchen", d => d.getUTCHours(), 24, NOW);
  assert.equal(r.count[18], 2);
  assert.equal(r.avg[18], 15);
});

test("fmtMin: minutos redondeados y segundos cuando es menos de 1 min", () => {
  assert.equal(fmtMin(7.6), "8 min");
  assert.equal(fmtMin(0.5), "30 s");
});

test("reglas del trigger (espejo en JS): insertar, preparar, listo, desmarcar y cambiar producto", () => {
  const n = at(0);
  let t = applyItemTimes(null, { item_status: "enviado" }, n);
  assert.deepEqual(t, { sent_at: n, started_at: null, ready_at: null });
  t = applyItemTimes({ item_status: "enviado", ...t }, { item_status: "preparando" }, at(2));
  assert.equal(t.started_at, at(2));
  t = applyItemTimes({ item_status: "preparando", ...t }, { item_status: "listo" }, at(9));
  assert.equal(t.ready_at, at(9));
  // "Marcar cocina lista" sobre algo que ya estaba listo no mueve la hora
  assert.equal(applyItemTimes({ item_status: "listo", ...t }, { item_status: "listo" }, at(30)).ready_at, at(9));
  // Desmarcar el listo por error borra la hora y conserva cuándo empezaron
  const back = applyItemTimes({ item_status: "listo", ...t }, { item_status: "preparando" }, at(10));
  assert.equal(back.ready_at, null);
  assert.equal(back.started_at, at(2));
  // Cambio de producto en preparación: el reemplazo cuenta desde cero
  const sw = applyItemTimes({ item_status: "preparando", product_id: "a", ...t }, { item_status: "enviado", product_id: "b" }, at(12));
  assert.deepEqual(sw, { sent_at: at(12), started_at: null, ready_at: null });
  // Marcar listo sin pasar por "preparando": se mide igual (empezar queda sin dato)
  const direct = applyItemTimes({ item_status: "enviado", sent_at: n, started_at: null, ready_at: null }, { item_status: "listo" }, at(7));
  assert.deepEqual(direct, { sent_at: n, started_at: null, ready_at: at(7) });
});

test("Fase 20: columnas sin default, trigger que pone las horas y no deja escribirlas a mano", () => {
  const sql = readFileSync(new URL("../supabase/fase20-tiempos-preparacion.sql", import.meta.url), "utf8");
  for (const c of ["sent_at", "started_at", "ready_at"]) assert.match(sql, new RegExp(`add column if not exists ${c} timestamptz;`));
  assert.doesNotMatch(sql, /timestamptz\s+default/i);
  assert.match(sql, /new\.sent_at\s+:= old\.sent_at;/);
  assert.match(sql, /before insert or update on order_items/);
  assert.match(sql, /new\.product_id is distinct from old\.product_id/);
});

test("Admin → Tiempos: pestaña, carga con período anterior y aviso si falta la Fase 20", () => {
  const app = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
  assert.match(app, /\{key:"times",label:"Tiempos",icon:<IconClock size=\{17\}\/>\}/);
  assert.match(app, /else if \(k==="times"\) loadPrepTimes\(\);/);
  assert.match(app, /select\("product_name,station,quantity,sent_at,started_at,ready_at,orders!inner\(status\)"\)/);
  assert.match(app, /Falta activar el registro de tiempos/);
  assert.match(app, /goodWhenDown label="Cocina · promedio hasta listo"/);
  const demo = readFileSync(new URL("../app/ui/demo-store.ts", import.meta.url), "utf8");
  assert.match(demo, /applyItemTimes\(before, r as/);
});
