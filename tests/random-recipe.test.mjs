import assert from "node:assert/strict";
import test from "node:test";
import { createRandomRecipe } from "../lib/random-recipe.ts";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test("random recipes stay inside editor ranges and use unique inks", () => {
  const inks = Array.from({ length: 17 }, (_, index) => `ink-${index}`);
  const papers = ["warm", "natural", "gray", "kraft", "white"];

  for (let seed = 1; seed <= 80; seed += 1) {
    const recipe = createRandomRecipe(inks, papers, seededRandom(seed));
    assert.ok(recipe.plateInkIds.length >= 1 && recipe.plateInkIds.length <= 6);
    assert.equal(new Set(recipe.plateInkIds).size, recipe.plateInkIds.length);
    assert.ok(papers.includes(recipe.paperId));
    assert.ok(["screen", "grain"].includes(recipe.screening));
    assert.ok(["dot", "offset", "rosette"].includes(recipe.angleMode));
    assert.ok(recipe.freq >= 36 && recipe.freq <= 78);
    assert.ok(recipe.grainSizeMM >= 0.22 && recipe.grainSizeMM <= 0.9);
    assert.ok(recipe.brightness >= -12 && recipe.brightness <= 12);
    assert.ok(recipe.contrast >= -8 && recipe.contrast <= 18);
    assert.ok(recipe.ink >= 68 && recipe.ink <= 98);
    assert.ok(recipe.paperTexture >= 60 && recipe.paperTexture <= 140);
    assert.ok(recipe.shift >= 0 && recipe.shift <= 8);
    assert.equal(recipe.customScreens.length, recipe.plateInkIds.length);
  }
});
