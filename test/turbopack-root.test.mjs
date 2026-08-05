import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

test("pins Turbopack to the Cabane project root", () => {
  assert.match(config, /const projectRoot = path\.dirname\(fileURLToPath\(import\.meta\.url\)\);/);
  assert.match(config, /turbopack:\s*\{\s*root: projectRoot,?\s*\}/);
});
