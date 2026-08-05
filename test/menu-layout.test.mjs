import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("product cards reserve independent grid areas for information, controls and notes", () => {
  assert.match(client, /className="product-row-main"/);
  assert.match(client, /className="product-row-control"/);
  assert.match(client, /className="product-row-notes"/);
  assert.match(client, /grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(client, /\.product-row-notes\{grid-column:1\/-1/);
});

test("desktop does not force product cards into a horizontal flex row", () => {
  assert.doesNotMatch(client, /\.product-list-item\{flex-direction:row!important\}/);
});
