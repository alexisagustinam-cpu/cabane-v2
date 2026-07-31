import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");

test("admin fetch refreshes an expiring session before the request", () => {
  assert.match(client, /async function adminFetch/);
  assert.match(client, /expires_at[\s\S]*Date\.now\(\) \+ 60000/);
  assert.match(client, /auth\.refreshSession\(\)/);
});

test("admin fetch retries once after a 401 response", () => {
  assert.match(client, /if \(response\.status===401\)[\s\S]*auth\.refreshSession\(\)[\s\S]*requestWithToken/);
});

test("all protected admin calls use the refreshing helper", () => {
  assert.doesNotMatch(client, /fetch\("\/api\/admin\//);
  assert.equal((client.match(/adminFetch\("\/api\/admin\/users"/g)||[]).length, 3);
  assert.equal((client.match(/adminFetch\("\/api\/admin\/orders"/g)||[]).length, 1);
});

test("expired refresh token produces an actionable login message", () => {
  assert.match(client, /Tu sesión venció\. Vuelve a ingresar/);
});
