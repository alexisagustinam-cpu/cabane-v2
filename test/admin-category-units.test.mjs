import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("admin category sales report exposes, totals, displays, and exports sold units", () => {
  assert.match(client, /categoryBreakdown:\{name:string;qty:number;revenue:number;products:\{name:string;qty:number;revenue:number\}\[\]\}\[\]/);
  assert.match(client, /const catMap: Record<string,\{qty:number;revenue:number\}> = \{\};[\s\S]*?catMap\[c\]\.qty\+=i\.quantity;[\s\S]*?catMap\[c\]\.revenue\+=i\.quantity\*i\.unit_price;[\s\S]*?map\(\(\[name,\{qty,revenue\}\]\)=>\(\{/);
  // Muestra las unidades vendidas por categoría ("1 ud" / "3 uds").
  assert.match(client, /\{r\.qty\} \{r\.qty===1\?"ud":"uds"\}/);
  assert.match(client, /rows\.push\(\["Categoría","Unidades vendidas","Facturado"\]\)/);
});
