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
  brightness: number;
  contrast: number;
  ink: number;
  paperTexture: number;
  shift: number;
  showPaper: boolean;
  paper?: [number, number, number];
  /** Paper profile values. Amounts are stored as 0–1 fractions. */
  paperGrainAmount?: number;
  paperGrainScaleMM?: number;
  paperFiberAmount?: number;
  paperInkAcceptanceVariation?: number;
  quality?: "preview" | "export";
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

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number) {
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
  black: "#000000",
  blue: "#0078bf",
  fluorescentPink: "#ff48b0",
  green: "#00a95c",
  orange: "#ff6c2f",
  red: "#f15060",
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

function separate(source: ImageData, profiles: EngineInk[], paperLinear: [number, number, number], settings: EngineSettings) {
  const { width, height, data } = source;
  const maps = profiles.map(() => new Float32Array(width * height));
  const linear = new Float32Array(width * height * 3);
  const contrast = 1 + settings.contrast / 100;
  const brightness = settings.brightness / 100;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const input = srgbToLinear(data[offset + channel] / 255);
        linear[pixel * 3 + channel] = clamp((input - 0.5) * contrast + 0.5 + brightness);
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const r = linear[pixel * 3];
      const g = linear[pixel * 3 + 1];
      const b = linear[pixel * 3 + 2];
      const target = oklab(r, g, b);
      const levels = settings.quality === "export" ? (profiles.length > 2 ? 5 : 7) : 5;
      const values = profiles.map(() => 0);
      const score = (candidate: number[]) => {
        const predicted = [paperLinear[0], paperLinear[1], paperLinear[2]];
        candidate.forEach((coverage, index) => {
          const absorption = profiles[index].absorption;
          for (let channel = 0; channel < 3; channel += 1) predicted[channel] *= Math.exp(-absorption[channel] * coverage);
        });
        const candidateLab = oklab(predicted[0], predicted[1], predicted[2]);
        const dl = target[0] - candidateLab[0];
        const da = target[1] - candidateLab[1];
        const db = target[2] - candidateLab[2];
        return dl * dl + da * da + db * db;
      };
      // Coordinate descent keeps the preview responsive for six plates while
      // retaining the same joint absorption model as tone's exhaustive search.
      let bestScore = score(values);
      for (let pass = 0; pass < (settings.quality === "export" ? 2 : 1); pass += 1) {
        profiles.forEach((_profile, index) => {
          let local = values[index];
          let localScore = bestScore;
          for (let level = 0; level < levels; level += 1) {
            const candidate = level / (levels - 1);
            values[index] = candidate;
            const candidateScore = score(values);
            if (candidateScore < localScore) {
              local = candidate;
              localScore = candidateScore;
            }
          }
          values[index] = local;
          bestScore = localScore;
        });
      }
      values.forEach((value, index) => {
        maps[index][pixel] = value * (settings.ink / 100);
      });
    }
  }
  return maps;
}

export function renderPipeline(source: ImageData, plates: EnginePlate[], settings: EngineSettings): RenderResult {
  const paperSRGB = settings.paper ?? [0.945, 0.933, 0.894];
  const paperLinear = paperSRGB.map(srgbToLinear) as [number, number, number];
  const profiles = plates.map((plate) => engineInkCatalog[plate.inkId] ?? engineInkCatalog.black);
  const coverage = separate(source, profiles, paperLinear, settings);
  const { width, height } = source;
  const total = width * height;
  const master = profiles.map(() => new Float32Array(total));
  const printed = profiles.map(() => new Float32Array(total));
  const registered = profiles.map(() => new Float32Array(total));
  const outputDPI = 300;
  // `paperTexture` is the user's overall strength control. Individual paper
  // profiles still define the material response used by separation and print.
  const paperStrength = settings.showPaper ? settings.paperTexture / 100 : 0;
  const paperAcceptance = (settings.paperInkAcceptanceVariation ?? 0.08) * paperStrength;
  const paperGrain = (settings.paperGrainAmount ?? 0.05) * paperStrength;
  const paperFiber = (settings.paperFiberAmount ?? 0.5) * paperStrength;
  const paperScalePx = Math.max(1, ((settings.paperGrainScaleMM ?? 0.35) * outputDPI) / 25.4);

  for (let plateIndex = 0; plateIndex < profiles.length; plateIndex += 1) {
    const plate = plates[plateIndex];
    const custom = plate.custom ?? {};
    const freq = custom.freq ?? settings.freq;
    // LPI is a physical output unit. The preview and export use the same
    // period in pixels at the target DPI, regardless of preview dimensions.
    const period = Math.max(1, outputDPI / Math.max(freq, 1));
    const angle = ((custom.angle ?? screenAngle(settings.angleMode, plateIndex)) * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const dotGain = custom.dotGain ?? 0.16;
    const density = custom.density ?? 1;
    const offsetX = ((custom.offsetX ?? 0) * outputDPI) / 25.4 + (plateIndex % 2 === 0 ? -settings.shift : settings.shift);
    const offsetY = ((custom.offsetY ?? 0) * outputDPI) / 25.4;
    const rotation = ((custom.rotation ?? 0) * Math.PI) / 180;
    const coverageMap = coverage[plateIndex];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const value = sampleBilinear(coverageMap, width, height, x, y) * density;
        if (settings.screening === "grain") {
          const threshold = clamp((1 - dotGain) * (0.2 + valueNoise(x / Math.max(period, 1), y / Math.max(period, 1), 41 + plate.id)));
          master[plateIndex][pixel] = value >= threshold ? 1 : 0;
        } else {
          const u = cosine * (x - width / 2) - sine * (y - height / 2);
          const v = sine * (x - width / 2) + cosine * (y - height / 2);
          const cellU = (u / period - Math.floor(u / period) - 0.5) * period;
          const cellV = (v / period - Math.floor(v / period) - 0.5) * period;
          const distance = Math.hypot(cellU, cellV);
          const radius = period * 0.53 * Math.sqrt(clamp(value)) * (1 + dotGain);
          const edge = Math.max(0.45, period * 0.08 + (custom.edgeGrain ?? 0) * 2);
          master[plateIndex][pixel] = 1 - clamp((distance - radius + edge) / (2 * edge));
        }
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const coarse = valueNoise(x / Math.max(paperScalePx * 5, 1), y / Math.max(paperScalePx * 5, 1), 91 + plate.id);
        const fine = valueNoise(x / Math.max(period, 1), y / Math.max(period, 1), 151 + plate.id);
        // Paper acceptance is centered around the nominal ink density. It
        // therefore makes an ink plate uneven without globally darkening it.
        const acceptance = 1 + (coarse - 0.5) * paperAcceptance;
        const densityVar = custom.densityVar ?? 0;
        const grainAmount = custom.edgeGrain ?? paperGrain;
        printed[plateIndex][pixel] = clamp(master[plateIndex][pixel] * acceptance * (1 - densityVar * (coarse - 0.5)) * (1 - grainAmount * 0.22 * (fine - 0.5)));
      }
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const warpPx = ((custom.warp ?? 0) * outputDPI) / 25.4;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const noiseX = (valueNoise(x / Math.max(width / 4, 1), y / Math.max(height / 4, 1), 201 + plate.id) - 0.5) * warpPx;
        const noiseY = (valueNoise(x / Math.max(width / 4, 1), y / Math.max(height / 4, 1), 251 + plate.id) - 0.5) * warpPx;
        const localX = x - centerX - offsetX + noiseX;
        const localY = y - centerY - offsetY + noiseY;
        const rotatedX = Math.cos(rotation) * localX + Math.sin(rotation) * localY + centerX;
        const rotatedY = -Math.sin(rotation) * localX + Math.cos(rotation) * localY + centerY;
        registered[plateIndex][y * width + x] = sampleBilinear(printed[plateIndex], width, height, rotatedX, rotatedY);
      }
    }
  }

  const imageData = new ImageData(width, height);
  const opacity = plates.map((plate) => plate.custom?.opacity ?? 0.7);
  for (let pixel = 0; pixel < total; pixel += 1) {
    const result = [paperLinear[0], paperLinear[1], paperLinear[2]];
    if (!settings.showPaper) result[0] = result[1] = result[2] = 1;
    profiles.forEach((profile, index) => {
      const coverageValue = registered[index][pixel] * opacity[index];
      for (let channel = 0; channel < 3; channel += 1) result[channel] *= Math.exp(-profile.absorption[channel] * coverageValue);
    });
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    // Coarse luminance noise represents paper grain. Fibres are deliberately
    // anisotropic and contribute at 30% of their profile amount, matching the
    // material weighting observed in the reference app.
    const grainNoise = valueNoise(x / paperScalePx, y / paperScalePx, 701) - 0.5;
    const fiberNoise = valueNoise(x / Math.max(paperScalePx * 0.38, 1), y / Math.max(paperScalePx * 3.8, 1), 719) - 0.5;
    const paperNoise = settings.showPaper ? grainNoise * paperGrain + fiberNoise * paperFiber * paperGrain * 0.3 : 0;
    const offset = pixel * 4;
    imageData.data[offset] = Math.round(clamp(linearToSrgb(result[0] + paperNoise)) * 255);
    imageData.data[offset + 1] = Math.round(clamp(linearToSrgb(result[1] + paperNoise)) * 255);
    imageData.data[offset + 2] = Math.round(clamp(linearToSrgb(result[2] + paperNoise)) * 255);
    imageData.data[offset + 3] = 255;
  }
  return { width, height, imageData, coverage, master, printed, registered };
}
