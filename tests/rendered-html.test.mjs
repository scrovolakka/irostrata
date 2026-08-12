import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { calculateWorkSize } from "../lib/render-size.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the IROSTRATA studio shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /RISO-STYLE PRINT LAB/);
  assert.match(html, /LIVE PROOF \/[\s\S]*?COLORS/);
  assert.match(html, /PLATE SETTINGS/);
  assert.match(html, /COMPOSITE/);
  assert.match(html, /ORIG/);
  assert.match(html, /Dot on Dot/);
  assert.match(html, /GRAIN/);
  assert.match(html, /RANDOM/);
  assert.match(html, /COMPARE/);
  assert.match(html, />EN</);
  assert.match(html, />日本</);
  assert.match(html, />JT</);
  assert.match(html, /type="file"/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps landscape, portrait, and square working canvases proportional", () => {
  const budget = 648000;
  const cases = [
    { name: "landscape", ratio: 16 / 9 },
    { name: "portrait", ratio: 9 / 16 },
    { name: "square", ratio: 1 },
  ];

  for (const sample of cases) {
    const size = calculateWorkSize(sample.ratio, { maxPixels: budget, maxEdge: 1200 });
    assert.ok(size.width > 0 && size.height > 0, `${sample.name} has usable dimensions`);
    assert.ok(size.width <= 1200 && size.height <= 1200, `${sample.name} respects the edge limit`);
    assert.ok(size.pixels <= budget + 1800, `${sample.name} stays within the pixel budget`);
    assert.ok(Math.abs(size.width / size.height - sample.ratio) < 0.01, `${sample.name} preserves its frame ratio`);
  }
});

test("bundles the export worker as a browser asset", async () => {
  const staticDirectory = new URL("../dist/client/_next/static/", import.meta.url);
  const assets = await readdir(staticDirectory);
  assert.ok(
    assets.some((name) => /^export\.worker-.+\.js$/.test(name)),
    "the export worker is emitted as a standalone browser asset",
  );

  const chunksDirectory = new URL("../dist/client/_next/static/chunks/", import.meta.url);
  const chunks = await readdir(chunksDirectory);
  const studioChunk = chunks.find((name) => /^studio-.+\.js$/.test(name));
  assert.ok(studioChunk, "the studio client chunk exists");
  const source = await readFile(new URL(studioChunk, chunksDirectory), "utf8");
  assert.match(source, /export\.worker-.+\.js/);
  assert.doesNotMatch(source, /file:\/\/\/app\/export\.worker/);
});
