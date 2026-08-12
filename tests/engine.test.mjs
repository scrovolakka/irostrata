import assert from "node:assert/strict";
import test from "node:test";

// The engine uses only the web ImageData shape. This small polyfill lets the
// deterministic numerical pipeline run under Node without a browser canvas.
if (!globalThis.ImageData) {
  globalThis.ImageData = class ImageData {
    constructor(dataOrWidth, widthOrHeight, maybeHeight) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = maybeHeight;
      }
    }
  };
}

const { renderPipeline, renderStageImage } = await import("../app/engine.ts");
const { setJpegDpi, setPngDpi } = await import("../app/export-utils.ts");

const baseSettings = {
  screening: "screen",
  angleMode: "offset",
  freq: 47,
  grainSizeMM: 0.45,
  brightness: 0,
  contrast: 0,
  ink: 88,
  paperTexture: 100,
  shift: 2,
  showPaper: true,
  paper: [244 / 255, 238 / 255, 220 / 255],
  paperGrainAmount: 0.05,
  paperGrainScaleMM: 0.35,
  paperFiberAmount: 0.5,
  paperInkAcceptanceVariation: 0.08,
};

function sourceImage(width = 16, height = 16) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 35 + x * 9;
      data[offset + 1] = 70 + y * 7;
      data[offset + 2] = 145 + ((x + y) % 5) * 14;
      data[offset + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

test("produces deterministic coverage and subtractive composite stages", () => {
  const source = sourceImage();
  const plates = [{ id: 1, inkId: "fluorescentPink" }, { id: 2, inkId: "blue" }];
  const first = renderPipeline(source, plates, baseSettings);
  const second = renderPipeline(source, plates, baseSettings);
  assert.deepEqual(first.imageData.data, second.imageData.data);
  assert.ok(first.coverage.every((map) => map.some((value) => value > 0)));
  assert.ok(first.master.every((map) => map.some((value) => value > 0)));
  assert.notDeepEqual(first.imageData.data, source.data);
});

test("paper profile and grain size alter the expected pipeline stages", () => {
  const source = sourceImage();
  const plates = [{ id: 1, inkId: "red" }, { id: 2, inkId: "blue" }];
  const warm = renderPipeline(source, plates, baseSettings);
  const kraft = renderPipeline(source, plates, { ...baseSettings, paper: [191 / 255, 156 / 255, 107 / 255], paperGrainScaleMM: 0.55, paperFiberAmount: 0.62, paperInkAcceptanceVariation: 0.1 });
  assert.notDeepEqual(warm.coverage[0], kraft.coverage[0]);
  assert.notDeepEqual(warm.imageData.data, kraft.imageData.data);

  const fine = renderPipeline(source, plates, { ...baseSettings, screening: "grain", grainSizeMM: 0.2 });
  const coarse = renderPipeline(source, plates, { ...baseSettings, screening: "grain", grainSizeMM: 1.1 });
  assert.notDeepEqual(fine.master[0], coarse.master[0]);
});

test("exposes all inspection stages as full-size RGBA images", () => {
  const source = sourceImage(8, 6);
  const plates = [{ id: 1, inkId: "yellow" }, { id: 2, inkId: "blue" }];
  const result = renderPipeline(source, plates, baseSettings);
  for (const stage of ["original", "tone", "gamut", "coverage", "master", "printed", "registered", "composite"]) {
    const image = renderStageImage(result, source, plates, baseSettings, stage, 0);
    assert.equal(image.data.length, 8 * 6 * 4, stage);
  }
});

test("reuses earlier pipeline stages without changing the composite", () => {
  const source = sourceImage();
  const plates = [{ id: 1, inkId: "fluorescentPink" }, { id: 2, inkId: "blue" }];
  const first = renderPipeline(source, plates, baseSettings);
  const reused = renderPipeline(source, plates, {
    ...baseSettings,
    coverageOverride: first.coverage,
    masterOverride: first.master,
    printedOverride: first.printed,
    registeredOverride: first.registered,
  });
  assert.deepEqual(reused.imageData.data, first.imageData.data);
});

test("injects 300 DPI pHYs metadata into PNG bytes", () => {
  // Minimal structural byte buffer: signature + one 25-byte IHDR chunk.
  const bytes = new Uint8Array(40);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const tagged = setPngDpi(bytes, 300);
  const text = new TextDecoder().decode(tagged);
  assert.match(text, /pHYs/);
  assert.equal(tagged.length, bytes.length + 21);
});

test("writes 300 DPI density fields into JFIF JPEG bytes", () => {
  const bytes = new Uint8Array(24);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0]);
  const tagged = setJpegDpi(bytes, 300);
  assert.equal(tagged[13], 1);
  assert.equal((tagged[14] << 8) | tagged[15], 300);
  assert.equal((tagged[16] << 8) | tagged[17], 300);
});
