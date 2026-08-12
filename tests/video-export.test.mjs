import assert from "node:assert/strict";
import test from "node:test";
import { calculateVideoFrameCount, calculateVideoSize, formatVideoTime } from "../lib/video-export.mjs";

test("creates even video dimensions without materially changing ratio", () => {
  for (const ratio of [16 / 9, 9 / 16, 1, 4 / 5]) {
    const size = calculateVideoSize(ratio, 720);
    assert.equal(size.width % 2, 0);
    assert.equal(size.height % 2, 0);
    assert.equal(Math.max(size.width, size.height), 720);
    assert.ok(Math.abs(size.width / size.height - ratio) < 0.01);
  }
});

test("counts constant-rate frames and formats transport time", () => {
  assert.equal(calculateVideoFrameCount(2.01, 12), 25);
  assert.equal(calculateVideoFrameCount(0, 12), 0);
  assert.equal(formatVideoTime(65.9), "1:05");
});
