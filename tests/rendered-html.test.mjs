import assert from "node:assert/strict";
import test from "node:test";

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

test("renders the INKLOOM studio shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /INKLOOM \/ PRINT LAB/);
  assert.match(html, /LIVE PROOF \/[\s\S]*?COLORS/);
  assert.match(html, /CUSTOMIZE/);
  assert.match(html, /ORIG/);
  assert.match(html, /Dot on Dot/);
  assert.match(html, /GRAIN/);
  assert.match(html, /type="file"/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});
