import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const charts = readFileSync(new URL("../app/ui/charts.tsx", import.meta.url), "utf8");

test("reports lead with stat tiles that compare against the previous period", () => {
  assert.match(client, /<StatTile hero tone=\{RED\} label=\{`Facturado/);
  assert.match(client, /<StatTile tone=\{DARK\} label="Pedidos cobrados"/);
  assert.match(client, /<StatTile tone="#4A3540" label="Ticket promedio"/);
  assert.match(client, /delta=\{pct\(count,prevCount\)\}/);
});

test("payment methods are one part-to-whole bar with a validated palette and values in the legend", () => {
  assert.match(client, /<ShareBar format=\{\$\} parts=\{\[/);
  assert.match(charts, /export const CATEGORICAL = \["#A8325A", "#DB8F23", "#2A78D6"\]/);
});

test("hourly and weekday charts are interactive and offer a table view", () => {
  assert.match(client, /<ColumnChart ariaLabel="Ventas por hora"/);
  assert.match(client, /<ColumnChart ariaLabel="Ventas por día de la semana"/);
  assert.match(charts, /role="tooltip"/);
  assert.match(charts, /Ver como tabla/);
  assert.match(charts, /maxWidth: 24/); // barras finas
});

test("products can be searched, filtered by category and toggled with a switch", () => {
  assert.match(client, /aria-label="Buscar producto" value=\{prodSearch\}/);
  assert.match(client, /ariaLabel="Filtrar por categoría"/);
  assert.match(client, /<Switch checked=\{isActive\(p\)\}/);
  assert.match(client, /eyebrow="Editar producto"/);
});

test("users are compact cards managed from a single sheet", () => {
  assert.match(client, /eyebrow="Gestionar usuario"/);
  assert.doesNotMatch(client, />Reset pass</);
});
