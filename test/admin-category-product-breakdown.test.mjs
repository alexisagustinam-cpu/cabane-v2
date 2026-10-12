import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("admin category report aggregates and exports a product drill-down", () => {
  assert.match(client, /categoryBreakdown:\{name:string;qty:number;revenue:number;products:\{name:string;qty:number;revenue:number\}\[\]\}\[\]/);
  assert.match(client, /const productMap: Record<string,Record<string,\{qty:number;revenue:number\}>> = \{\};[\s\S]*?productMap\[c\]\[i\.product_name\]\.qty\+=i\.quantity;[\s\S]*?products:\[/);
  assert.match(client, /setSelectedReportCategory\(selectedReportCategory===r\.name\?null:r\.name\)/);
  assert.match(client, /selectedCategory\.products\.map\(p=>\(/);
  assert.match(client, /\["Producto","Unidades vendidas","Facturado","% del total de categoría"\]/);
});

test("admin category report includes active zero-sale menu products in the drill-down and CSV", () => {
  assert.match(client, /getDB\(\)\.from\("products"\)\.select\("id,name,category,is_active"\)/);
  assert.match(client, /const activeProductsByCategory: Record<string,\{name:string;qty:number;revenue:number\}\[\]> = \{\}/);
  assert.match(client, /\.\.\.\(activeProductsByCategory\[name\]\|\|\[\]\)\.map\(product=>\(\{\.\.\.product,\.\.\.\(productMap\[name\]\?\.\[product\.name\]\|\|\{\}\)\}\)\)/);
  assert.match(client, /sort\(\(a,b\)=>b\.revenue-a\.revenue\|\|b\.qty-a\.qty\|\|a\.name\.localeCompare\(b\.name\)\)/);
  assert.match(client, /r\.products\.forEach\(p=>rows\.push\(\[p\.name, p\.qty, p\.revenue\.toFixed\(2\), `\$\{r\.revenue\?Math\.round\(p\.revenue\/r\.revenue\*100\):0\}%`\]\)\)/);
});

test("stats charts flow directly below the left reporting panels on desktop", () => {
  assert.doesNotMatch(client, /\.stats-charts\{grid-column:1;grid-row:2\}/);
  assert.match(client, /\.stats-left\{display:contents\}\.stats-left-core\{order:1\}\.stats-right\{order:2\}\.stats-charts\{order:3\}/);
  assert.match(client, /@media\(min-width:1000px\)\{[\s\S]*?\.stats-left\{display:block\}/);
  assert.match(client, /<div className="stats-left">[\s\S]*?<div className="stats-left-core">[\s\S]*?<div className="stats-charts">[\s\S]*?Ventas por hora[\s\S]*?Ventas por día de la semana[\s\S]*?<\/div>[\s\S]*?<div className="stats-right">/);
});
