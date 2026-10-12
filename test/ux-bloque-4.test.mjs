import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/client-app.tsx", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../app/ui/tokens.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("secondary text meets 4.5:1 on the cream background", () => {
  assert.match(tokens, /MUTED = "#6B5647"/);
  assert.match(css, /--cb-muted: #6B5647;/);
  assert.doesNotMatch(client, /#B3A184|#A08D75|#8F7E66/);
});

test("bar has its own notification sound", () => {
  assert.match(client, /function playBeep\(station: Station = "kitchen"\)/);
  assert.match(client, /a\.playbackRate = bar \? 1\.45 : 1;/);
  assert.match(client, /playBeep\(station\);/);
});

test("kitchen and bar can switch to a remembered dark mode", () => {
  assert.match(client, /const K = kdsDark \? KDS_DARK : KDS_LIGHT;/);
  assert.match(client, /localStorage\.setItem\("cabane_kds_dark"/);
});

test("the browser keeps its own pull-to-refresh (no custom gesture on top)", () => {
  assert.doesNotMatch(client, /PullToRefresh/);
  assert.doesNotMatch(css, /overscroll-behavior-y: contain/);
});

test("audio unlock runs once and never leaves the alert muted", () => {
  assert.match(client, /if \(!_audioUnlocked && !_audioUnlocking\)/);
  assert.match(client, /\.finally\(\(\) => \{ a\.muted = false; a\.volume = 1; _audioUnlocking = false; \}\)/);
});
