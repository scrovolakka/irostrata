/// <reference lib="webworker" />

import { renderPipeline, renderStageImage, type EnginePlate, type EngineSettings, type RenderStage } from "./engine";

type ExportRequest = {
  type: "render";
  width: number;
  height: number;
  source: Uint8ClampedArray;
  plates: EnginePlate[];
  settings: EngineSettings;
  stages: Array<{ stage: RenderStage; plateIndex: number; key: string }>;
};

let cancelled = false;

self.onmessage = async (event: MessageEvent<ExportRequest | { type: "cancel" }>) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    return;
  }
  cancelled = false;
  const { width, height, source, plates, settings, stages } = event.data;
  const tileHeight = Math.min(192, height);
  const outputs = Object.fromEntries(stages.map((stage) => [stage.key, {
    data: new Uint8ClampedArray(width * height * (stage.stage === "composite" ? 4 : 1)),
    channels: stage.stage === "composite" ? 4 : 1,
  }]));
  const separationCache = new Map<number, number[]>();
  const totalTiles = Math.ceil(height / tileHeight);

  for (let tileIndex = 0; tileIndex < totalTiles; tileIndex += 1) {
    if (cancelled) {
      self.postMessage({ type: "cancelled" });
      return;
    }
    const y = tileIndex * tileHeight;
    const tileH = Math.min(tileHeight, height - y);
    const halo = 96;
    const sourceY = Math.max(0, y - halo);
    const sourceBottom = Math.min(height, y + tileH + halo);
    const sourceH = sourceBottom - sourceY;
    const tileData = new Uint8ClampedArray(width * sourceH * 4);
    tileData.set(source.subarray(sourceY * width * 4, sourceBottom * width * 4));
    const tileSource = new ImageData(tileData, width, sourceH);
    const tileSettings = { ...settings, originY: sourceY, fullWidth: width, fullHeight: height, separationCache };
    const result = renderPipeline(tileSource, plates, tileSettings);
    const cropY = y - sourceY;
    for (const request of stages) {
      const stage = renderStageImage(result, tileSource, plates, tileSettings, request.stage, request.plateIndex);
      const output = outputs[request.key];
      if (output.channels === 4) {
        output.data.set(stage.data.subarray(cropY * width * 4, (cropY + tileH) * width * 4), y * width * 4);
      } else {
        const targetOffset = y * width;
        const sourceOffset = cropY * width * 4;
        for (let pixel = 0; pixel < width * tileH; pixel += 1) output.data[targetOffset + pixel] = stage.data[sourceOffset + pixel * 4];
      }
    }
    self.postMessage({ type: "progress", progress: Math.round(((tileIndex + 1) / totalTiles) * 100) });
    // Yield between strips so progress is painted and cancel messages are
    // handled without waiting for the complete high-resolution render.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const transfer = Object.values(outputs).map((output) => output.data.buffer);
  self.postMessage({ type: "done", outputs }, transfer);
};

export {};
