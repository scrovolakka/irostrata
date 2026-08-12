export type RandomCustomScreen = {
  freq: number;
  grainSizeMM: number;
  angle: number;
  density: number;
  opacity: number;
  dotGain: number;
  edgeGrain: number;
  densityVar: number;
  warp: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
};

export type RandomRecipe<TInk extends string, TPaper extends string> = {
  plateInkIds: TInk[];
  paperId: TPaper;
  screening: "screen" | "grain";
  angleMode: "dot" | "offset" | "rosette";
  customMode: boolean;
  freq: number;
  grainSizeMM: number;
  brightness: number;
  contrast: number;
  ink: number;
  paperTexture: number;
  shift: number;
  customScreens: RandomCustomScreen[];
};

function randomUnit(random: () => number) {
  return Math.max(0, Math.min(0.999999999, random()));
}

function randomIndex(length: number, random: () => number) {
  return Math.floor(randomUnit(random) * length);
}

function randomNumber(min: number, max: number, random: () => number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round((min + (max - min) * randomUnit(random)) * factor) / factor;
}

function shuffled<T>(items: readonly T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1, random);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** Produces a complete, art-directed recipe inside the editor's ranges. */
export function createRandomRecipe<TInk extends string, TPaper extends string>(
  inkIds: readonly TInk[],
  paperIds: readonly TPaper[],
  random: () => number = Math.random,
): RandomRecipe<TInk, TPaper> {
  if (!inkIds.length || !paperIds.length) throw new Error("Random recipes require inks and papers.");

  // Favour practical two-to-four-plate recipes while retaining the full range.
  const weightedPlateCounts = [1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6];
  const plateCount = Math.min(inkIds.length, weightedPlateCounts[randomIndex(weightedPlateCounts.length, random)]);
  const plateInkIds = shuffled(inkIds, random).slice(0, plateCount);
  const screening = randomUnit(random) < 0.68 ? "screen" : "grain";
  const angleModes = ["dot", "offset", "rosette"] as const;
  const grainSizeMM = randomNumber(0.22, 0.9, random, 2);

  const customScreens = plateInkIds.map(() => ({
    freq: randomNumber(34, 82, random),
    grainSizeMM,
    angle: randomNumber(0, 90, random),
    density: randomNumber(0.72, 1.16, random, 2),
    opacity: randomNumber(0.55, 0.92, random, 2),
    dotGain: randomNumber(0.04, 0.28, random, 2),
    edgeGrain: randomNumber(0.03, 0.28, random, 2),
    densityVar: randomNumber(0, 0.22, random, 2),
    warp: randomNumber(0, 0.2, random, 3),
    offsetX: randomNumber(-0.3, 0.3, random, 2),
    offsetY: randomNumber(-0.3, 0.3, random, 2),
    rotation: randomNumber(-0.35, 0.35, random, 3),
  }));

  return {
    plateInkIds,
    paperId: paperIds[randomIndex(paperIds.length, random)],
    screening,
    angleMode: angleModes[randomIndex(angleModes.length, random)],
    customMode: randomUnit(random) < 0.4,
    freq: randomNumber(36, 78, random),
    grainSizeMM,
    brightness: randomNumber(-12, 12, random),
    contrast: randomNumber(-8, 18, random),
    ink: randomNumber(68, 98, random),
    paperTexture: randomNumber(60, 140, random),
    shift: randomNumber(0, 8, random),
    customScreens,
  };
}
