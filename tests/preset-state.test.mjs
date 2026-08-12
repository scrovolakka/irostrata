import assert from "node:assert/strict";
import test from "node:test";
import { normalizePresetState } from "../lib/preset-state.mjs";

test("remaps custom plate settings when preset plate ids are normalized", () => {
  const preset = {
    plates: [{ id: 9, inkId: "blue" }, { id: 14, inkId: "red" }],
    settings: { customByPlate: { 9: { opacity: 0.31 }, 14: { opacity: 0.82 } } },
  };
  const normalized = normalizePresetState(preset, { opacity: 0.7, density: 1 }, { screening: "screen" });
  assert.deepEqual(normalized.plates.map((plate) => plate.id), [1, 2]);
  assert.equal(normalized.settings.customByPlate[1].opacity, 0.31);
  assert.equal(normalized.settings.customByPlate[2].opacity, 0.82);
  assert.equal(normalized.settings.customByPlate[1].density, 1);
});
