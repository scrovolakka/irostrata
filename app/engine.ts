export type EngineInk = {
  id: string;
  hex: string;
  absorption: [number, number, number];
};

export type EnginePlate = {
  id: number;
  inkId: string;
  custom?: {
    freq?: number;
    angle?: number;
    density?: number;
    opacity?: number;
    dotGain?: number;
    edgeGrain?: number;
    densityVar?: number;
    warp?: number;
    offsetX?: number;
    offsetY?: number;
    rotation?: number;
  };
};

export type EngineSettings = {
  screening: "screen" | "grain";
  angleMode: "dot" | "offset" | "rosette";
  freq: number;
  grainSizeMM?: number;
  brightness: number;
  contrast: number;
  ink: number;
  paperTexture: number;
  shift: number;
  showPaper: boolean;
  paper?: [number, number, number];
  paperGrainAmount?: number;
  paperGrainScaleMM?: number;
  paperFiberAmount?: number;
  paperInkAcceptanceVariation?: number;
  quality?: "preview" | "video" | "export";
  /** Global coordinates make independently rendered strips seam-free. */
  originX?: number;
  originY?: number;
  fullWidth?: number;
  fullHeight?: number;
  /** Reused by tiled export so a quantized source colour is solved once. */
  separationCache?: Map<number, number[]>;
  coverageOverride?: Float32Array[];
  masterOverride?: Float32Array[];
  printedOverride?: Float32Array[];
  registeredOverride?: Float32Array[];
};

export type RenderResult = {
  width: number;
  height: number;
  imageData: ImageData;
  coverage: Float32Array[];
  master: Float32Array[];
  printed: Float32Array[];
  registered: Float32Array[];
};

export type RenderStage = "original" | "tone" | "gamut" | "coverage" | "master" | "printed" | "registered" | "composite";

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(value: number) {
  const c = clamp(value);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function oklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function hashNoise(x: number, y: number, seed: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function smooth(value: number) {
  return value * value * (3 - 2 * value);
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hashNoise(x0, y0, seed);
  const b = hashNoise(x0 + 1, y0, seed);
  const c = hashNoise(x0, y0 + 1, seed);
  const d = hashNoise(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

function hexRgb(hex: string): [number, number, number] {
  const number = Number.parseInt(hex.replace("#", ""), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function absorptionFromHex(hex: string): [number, number, number] {
  return hexRgb(hex).map((channel) => -Math.log(Math.max(srgbToLinear(channel / 255), 1 / 255))) as [number, number, number];
}

const catalogHex: Record<string, string> = {
  black: "#171717",
  blue: "#0078bf",
  fluorescentPink: "#ff48b0",
  green: "#00a95c",
  orange: "#ff6c2f",
  red: "#ff665e",
  brightRed: "#f15060",
  yellow: "#ffe800",
  teal: "#00838a",
  purple: "#765ba7",
  brown: "#925f52",
  slate: "#5f7180",
  mediumBlue: "#3255a4",
  violet: "#9d7ad2",
  cornflower: "#62a8e5",
  sunflower: "#ffb511",
  burgundy: "#914e72",
};

export const engineInkCatalog: Record<string, EngineInk> = Object.fromEntries(
  Object.entries(catalogHex).map(([id, hex]) => [id, { id, hex, absorption: absorptionFromHex(hex) }]),
) as Record<string, EngineInk>;

const offsetAngles = [0, 7.5, -7.5, 15, -15, 22.5];
const rosetteAngles = [15, 75, 0, 45, 30, 60];

function screenAngle(mode: EngineSettings["angleMode"], index: number) {
  if (mode === "dot") return 0;
  if (mode === "rosette") return rosetteAngles[index % rosetteAngles.length];
  return offsetAngles[index % offsetAngles.length];
}

function sampleBilinear(buffer: Float32Array, width: number, height: number, x: number, y: number) {
  const xx = Math.max(0, Math.min(width - 1, x));
  const yy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(xx);
  const y0 = Math.floor(yy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = xx - x0;
  const ty = yy - y0;
  const top = buffer[y0 * width + x0] * (1 - tx) + buffer[y0 * width + x1] * tx;
  const bottom = buffer[y1 * width + x0] * (1 - tx) + buffer[y1 * width + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

function scoreCoverage(candidate: number[], target: [number, number, number], profiles: EngineInk[], strengths: number[], paperLinear: [number, number, number]) {
  const predicted = [paperLinear[0], paperLinear[1], paperLinear[2]];
  candidate.forEach((coverage, index) => {
    const absorption = profiles[index].absorption;
    for (let channel = 0; channel < 3; channel += 1) predicted[channel] *= Math.exp(-absorption[channel] * coverage * strengths[index]);
  });
  const candidateLab = oklab(predicted[0], predicted[1], predicted[2]);
  const dl = target[0] - candidateLab[0];
  const da = target[1] - candidateLab[1];
  const db = target[2] - candidateLab[2];
  return dl * dl + da * da + db * db;
}

function solveCoverage(target: [number, number, number], profiles: EngineInk[], strengths: number[], maxInk: number, quality: EngineSettings["quality"]) {
  if (profiles.length <= 2) {
    // Two plates can be searched globally. 41 export levels match the observed
    // tone ceiling while the colour cache keeps the per-pixel cost bounded.
    const levels = quality === "export" ? 41 : quality === "video" ? 9 : 17;
    const best = profiles.map(() => 0);
    let bestScore = Number.POSITIVE_INFINITY;
    const secondLevels = profiles.length === 2 ? levels : 1;
    for (let a = 0; a < levels; a += 1) {
      for (let b = 0; b < secondLevels; b += 1) {
        const candidate = profiles.length === 2 ? [(a / (levels - 1)) * maxInk, (b / (levels - 1)) * maxInk] : [(a / (levels - 1)) * maxInk];
        const score = scoreCoverage(candidate, target, profiles, strengths, paperLinearPlaceholder);
        if (score < bestScore) {
          bestScore = score;
          candidate.forEach((value, index) => { best[index] = value; });
        }
      }
    }
    return best;
  }

  return [];
}

// The solver receives paper through this short-lived binding to keep its hot
// inner loop allocation-free. renderPipeline is synchronous, so it is safe.
let paperLinearPlaceholder: [number, number, number] = [1, 1, 1];

function solveMultiInk(target: [number, number, number], profiles: EngineInk[], strengths: number[], maxInk: number, quality: EngineSettings["quality"]) {
  const levels = quality === "export" ? 13 : quality === "video" ? 5 : 9;
  const starts = quality === "video"
    ? [profiles.map(() => 0), profiles.map(() => maxInk * 0.55)]
    : [profiles.map(() => 0), profiles.map(() => maxInk * 0.45), profiles.map(() => maxInk)];
  let best = starts[0].slice();
  let bestScore = Number.POSITIVE_INFINITY;
  for (const start of starts) {
    const values = start.slice();
    let currentScore = scoreCoverage(values, target, profiles, strengths, paperLinearPlaceholder);
    for (let pass = 0; pass < (quality === "export" ? 4 : quality === "video" ? 1 : 2); pass += 1) {
      const order = Array.from({ length: profiles.length }, (_, index) => pass % 2 === 0 ? index : profiles.length - 1 - index);
      for (const index of order) {
        let localValue = values[index];
        let localScore = currentScore;
        for (let level = 0; level < levels; level += 1) {
          values[index] = (level / (levels - 1)) * maxInk;
          const score = scoreCoverage(values, target, profiles, strengths, paperLinearPlaceholder);
          if (score < localScore) {
            localScore = score;
            localValue = values[index];
          }
        }
        values[index] = localValue;
        currentScore = localScore;
      }
    }
    if (currentScore < bestScore) {
      bestScore = currentScore;
      best = values.slice();
    }
  }
  return best;
}

function separate(source: ImageData, profiles: EngineInk[], plates: EnginePlate[], paperLinear: [number, number, number], settings: EngineSettings) {
  const { width, height, data } = source;
  const maps = profiles.map(() => new Float32Array(width * height));
  const contrast = 1 + settings.contrast / 100;
  const brightness = settings.brightness / 100;
  const maxInk = clamp(settings.ink / 100);
  const cache = settings.separationCache ?? new Map<number, number[]>();
  const strengths = plates.map((plate) => (plate.custom?.density ?? 1) * (plate.custom?.opacity ?? 0.7));
  paperLinearPlaceholder = paperLinear;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const linear = [0, 1, 2].map((channel) => {
      const input = srgbToLinear(data[offset + channel] / 255);
      return clamp((input - 0.5) * contrast + 0.5 + brightness);
    }) as [number, number, number];
    // Video deliberately shares a smaller colour cube between frames. The
    // following halftone stage masks the tiny loss while avoiding a full
    // still-image colour solve for every moving frame.
    const quantizationMaximum = settings.quality === "video" ? 15 : 31;
    const qr = Math.round(linear[0] * quantizationMaximum);
    const qg = Math.round(linear[1] * quantizationMaximum);
    const qb = Math.round(linear[2] * quantizationMaximum);
    const key = (qr << 10) | (qg << 5) | qb;
    let values = cache.get(key);
    if (!values) {
      const target = oklab(qr / quantizationMaximum, qg / quantizationMaximum, qb / quantizationMaximum);
      values = profiles.length <= 2
        ? solveCoverage(target, profiles, strengths, maxInk, settings.quality)
        : solveMultiInk(target, profiles, strengths, maxInk, settings.quality);
      cache.set(key, values);
    }
    values.forEach((value, index) => { maps[index][pixel] = value; });
  }
  return maps;
}

export function renderPipeline(source: ImageData, plates: EnginePlate[], settings: EngineSettings): RenderResult {
  const paperSRGB = settings.showPaper ? settings.paper ?? [0.945, 0.933, 0.894] : [1, 1, 1] as [number, number, number];
  const paperLinear = paperSRGB.map(srgbToLinear) as [number, number, number];
  const profiles = plates.map((plate) => engineInkCatalog[plate.inkId] ?? engineInkCatalog.black);
  const coverage = settings.coverageOverride ?? separate(source, profiles, plates, paperLinear, settings);
  const { width, height } = source;
  const total = width * height;
  const master = settings.masterOverride ?? profiles.map(() => new Float32Array(total));
  const printed = settings.printedOverride ?? profiles.map(() => new Float32Array(total));
  const registered = settings.registeredOverride ?? profiles.map(() => new Float32Array(total));
  const outputDPI = 300;
  const originX = settings.originX ?? 0;
  const originY = settings.originY ?? 0;
  const fullWidth = settings.fullWidth ?? width;
  const fullHeight = settings.fullHeight ?? height;
  const paperStrength = settings.showPaper ? settings.paperTexture / 100 : 0;
  const paperAcceptance = (settings.paperInkAcceptanceVariation ?? 0.08) * paperStrength;
  const paperGrain = (settings.paperGrainAmount ?? 0.05) * paperStrength;
  const paperFiber = (settings.paperFiberAmount ?? 0.5) * paperStrength;
  const paperScalePx = Math.max(1, ((settings.paperGrainScaleMM ?? 0.35) * outputDPI) / 25.4);

  for (let plateIndex = 0; plateIndex < profiles.length; plateIndex += 1) {
    const plate = plates[plateIndex];
    const custom = plate.custom ?? {};
    const screenPeriod = Math.max(1, outputDPI / Math.max(custom.freq ?? settings.freq, 1));
    const grainPeriod = Math.max(1, ((settings.grainSizeMM ?? 0.45) * outputDPI) / 25.4);
    const period = settings.screening === "grain" ? grainPeriod : screenPeriod;
    const angle = ((custom.angle ?? screenAngle(settings.angleMode, plateIndex)) * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const dotGain = custom.dotGain ?? 0.16;
    const offsetX = ((custom.offsetX ?? 0) * outputDPI) / 25.4 + (plateIndex % 2 === 0 ? -settings.shift : settings.shift);
    const offsetY = ((custom.offsetY ?? 0) * outputDPI) / 25.4;
    const rotation = ((custom.rotation ?? 0) * Math.PI) / 180;
    const coverageMap = coverage[plateIndex];
    if (!settings.masterOverride) for (let y = 0; y < height; y += 1) {
      const gy = y + originY;
      for (let x = 0; x < width; x += 1) {
        const gx = x + originX;
        const pixel = y * width + x;
        const value = coverageMap[pixel];
        if (settings.screening === "grain") {
          const threshold = clamp((1 - dotGain) * (0.2 + valueNoise(gx / period, gy / period, 41 + plate.id)));
          master[plateIndex][pixel] = value >= threshold ? 1 : 0;
        } else {
          const u = cosine * (gx - fullWidth / 2) - sine * (gy - fullHeight / 2);
          const v = sine * (gx - fullWidth / 2) + cosine * (gy - fullHeight / 2);
          const cellU = (u / period - Math.floor(u / period) - 0.5) * period;
          const cellV = (v / period - Math.floor(v / period) - 0.5) * period;
          const distance = Math.hypot(cellU, cellV);
          const radius = period * 0.53 * Math.sqrt(clamp(value)) * (1 + dotGain);
          const edge = Math.max(0.45, period * 0.08 + (custom.edgeGrain ?? 0) * 2);
          master[plateIndex][pixel] = 1 - clamp((distance - radius + edge) / (2 * edge));
        }
      }
    }

    if (!settings.printedOverride) for (let y = 0; y < height; y += 1) {
      const gy = y + originY;
      for (let x = 0; x < width; x += 1) {
        const gx = x + originX;
        const pixel = y * width + x;
        const coarse = valueNoise(gx / Math.max(paperScalePx * 5, 1), gy / Math.max(paperScalePx * 5, 1), 91 + plate.id);
        const fine = valueNoise(gx / period, gy / period, 151 + plate.id);
        const acceptance = 1 + (coarse - 0.5) * paperAcceptance;
        const densityVar = custom.densityVar ?? 0;
        const grainAmount = custom.edgeGrain ?? paperGrain;
        printed[plateIndex][pixel] = clamp(master[plateIndex][pixel] * acceptance * (1 - densityVar * (coarse - 0.5)) * (1 - grainAmount * 0.22 * (fine - 0.5)));
      }
    }

    const centerX = fullWidth / 2;
    const centerY = fullHeight / 2;
    const warpPx = ((custom.warp ?? 0) * outputDPI) / 25.4;
    if (!settings.registeredOverride) for (let y = 0; y < height; y += 1) {
      const gy = y + originY;
      for (let x = 0; x < width; x += 1) {
        const gx = x + originX;
        const noiseX = (valueNoise(gx / Math.max(fullWidth / 4, 1), gy / Math.max(fullHeight / 4, 1), 201 + plate.id) - 0.5) * warpPx;
        const noiseY = (valueNoise(gx / Math.max(fullWidth / 4, 1), gy / Math.max(fullHeight / 4, 1), 251 + plate.id) - 0.5) * warpPx;
        const localX = gx - centerX - offsetX + noiseX;
        const localY = gy - centerY - offsetY + noiseY;
        const sampleGlobalX = Math.cos(rotation) * localX + Math.sin(rotation) * localY + centerX;
        const sampleGlobalY = -Math.sin(rotation) * localX + Math.cos(rotation) * localY + centerY;
        registered[plateIndex][y * width + x] = sampleBilinear(printed[plateIndex], width, height, sampleGlobalX - originX, sampleGlobalY - originY);
      }
    }
  }

  const imageData = new ImageData(width, height);
  const strengths = plates.map((plate) => (plate.custom?.density ?? 1) * (plate.custom?.opacity ?? 0.7));
  for (let pixel = 0; pixel < total; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const gx = x + originX;
    const gy = y + originY;
    const result = settings.showPaper ? [paperLinear[0], paperLinear[1], paperLinear[2]] : [1, 1, 1];
    profiles.forEach((profile, index) => {
      const coverageValue = registered[index][pixel] * strengths[index];
      for (let channel = 0; channel < 3; channel += 1) result[channel] *= Math.exp(-profile.absorption[channel] * coverageValue);
    });
    const grainNoise = valueNoise(gx / paperScalePx, gy / paperScalePx, 701) - 0.5;
    const fiberNoise = valueNoise(gx / Math.max(paperScalePx * 0.38, 1), gy / Math.max(paperScalePx * 3.8, 1), 719) - 0.5;
    const paperNoise = settings.showPaper ? grainNoise * paperGrain + fiberNoise * paperFiber * paperGrain * 0.3 : 0;
    const offset = pixel * 4;
    imageData.data[offset] = Math.round(clamp(linearToSrgb(result[0] + paperNoise)) * 255);
    imageData.data[offset + 1] = Math.round(clamp(linearToSrgb(result[1] + paperNoise)) * 255);
    imageData.data[offset + 2] = Math.round(clamp(linearToSrgb(result[2] + paperNoise)) * 255);
    imageData.data[offset + 3] = 255;
  }
  return { width, height, imageData, coverage, master, printed, registered };
}

function continuousComposite(result: RenderResult, plates: EnginePlate[], settings: EngineSettings) {
  const paperSRGB = settings.showPaper ? settings.paper ?? [0.945, 0.933, 0.894] : [1, 1, 1];
  const paperLinear = paperSRGB.map(srgbToLinear) as [number, number, number];
  const profiles = plates.map((plate) => engineInkCatalog[plate.inkId] ?? engineInkCatalog.black);
  const image = new ImageData(result.width, result.height);
  for (let pixel = 0; pixel < result.width * result.height; pixel += 1) {
    const value = [...paperLinear];
    profiles.forEach((profile, index) => {
      const amount = result.coverage[index][pixel] * (plates[index].custom?.density ?? 1) * (plates[index].custom?.opacity ?? 0.7);
      for (let channel = 0; channel < 3; channel += 1) value[channel] *= Math.exp(-profile.absorption[channel] * amount);
    });
    const offset = pixel * 4;
    image.data[offset] = Math.round(linearToSrgb(value[0]) * 255);
    image.data[offset + 1] = Math.round(linearToSrgb(value[1]) * 255);
    image.data[offset + 2] = Math.round(linearToSrgb(value[2]) * 255);
    image.data[offset + 3] = 255;
  }
  return image;
}

export function renderStageImage(result: RenderResult, source: ImageData, plates: EnginePlate[], settings: EngineSettings, stage: RenderStage, plateIndex = 0) {
  if (stage === "original") return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  if (stage === "composite") return result.imageData;
  const tone = stage === "tone" || stage === "gamut" ? continuousComposite(result, plates, settings) : null;
  if (stage === "tone" && tone) return tone;
  const image = new ImageData(result.width, result.height);
  if (stage === "gamut" && tone) {
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const difference = (Math.abs(source.data[offset] - tone.data[offset]) + Math.abs(source.data[offset + 1] - tone.data[offset + 1]) + Math.abs(source.data[offset + 2] - tone.data[offset + 2])) / 765;
      image.data[offset] = Math.round(245 * difference);
      image.data[offset + 1] = Math.round(64 * difference);
      image.data[offset + 2] = Math.round(110 * difference);
      image.data[offset + 3] = 255;
    }
    return image;
  }
  const maps = stage === "coverage" ? result.coverage : stage === "master" ? result.master : stage === "printed" ? result.printed : result.registered;
  const map = maps[Math.max(0, Math.min(maps.length - 1, plateIndex))];
  for (let pixel = 0; pixel < map.length; pixel += 1) {
    const gray = Math.round((1 - clamp(map[pixel])) * 255);
    const offset = pixel * 4;
    image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = gray;
    image.data[offset + 3] = 255;
  }
  return image;
}
