import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("root body tolerates browser-extension attributes without a hydration overlay", () => {
  assert.match(layout, /<body\s+suppressHydrationWarning/);
});
