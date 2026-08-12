import assert from "node:assert/strict";
import test from "node:test";
import { htmlLang, initialLocale, localeOptions, messages, translate } from "../app/i18n.ts";

test("ships complete English, Japanese, and Juicetopian dictionaries", () => {
  const englishKeys = Object.keys(messages.en).sort();
  assert.ok(englishKeys.length > 150);
  assert.deepEqual(Object.keys(messages.ja).sort(), englishKeys);
  assert.deepEqual(Object.keys(messages.jtp).sort(), englishKeys);
  assert.deepEqual(localeOptions.map((option) => option.id), ["en", "ja", "jtp"]);
});

test("interpolates notices and resolves initial language safely", () => {
  assert.equal(translate("ja", "notice.imageDone", { width: 1600, height: 2000 }), "1600×2000px / 300 DPIで書き出しました。");
  assert.match(translate("jtp", "notice.paper", { name: "KRAFT" }), /KRAFT/);
  assert.equal(initialLocale("jtp", "ja-JP"), "jtp");
  assert.equal(initialLocale(null, "ja-JP"), "ja");
  assert.equal(initialLocale("invalid", "en-US"), "en");
  assert.equal(htmlLang("jtp"), "art-x-juicetopian");
});
