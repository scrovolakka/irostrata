"use client";

import { ChangeEvent, CSSProperties, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { renderPipeline, renderStageImage, type RenderStage } from "./engine";
import { calculateWorkSize } from "../lib/render-size.mjs";
import { normalizePresetState } from "../lib/preset-state.mjs";
import { createZip, setJpegDpi, setPngDpi } from "./export-utils";

type InkId = "black" | "blue" | "fluorescentPink" | "green" | "orange" | "red" | "brightRed" | "yellow" | "burgundy" | "teal" | "purple" | "brown" | "slate" | "mediumBlue" | "violet" | "cornflower" | "sunflower";

type InkColor = {
  id: InkId;
  name: string;
  hex: string;
};

type InkPlate = {
  id: number;
  inkId: InkId;
};

type ScreeningMode = "screen" | "grain";
type AngleMode = "dot" | "offset" | "rosette";
type ExportMode = "image" | "print" | "separations";
type ExportFormat = "png" | "jpeg";
type SeparationStage = "coverage" | "master" | "registered";
type FrameRatio = "original" | "1:1" | "4:5" | "3:4" | "2:3" | "9:16" | "sqrt2";
type PaperId = "warmWhite" | "natural" | "recycledGray" | "kraft" | "white";
type CustomScreenKey = "freq" | "angle" | "density" | "opacity" | "dotGain" | "edgeGrain" | "densityVar" | "warp" | "offsetX" | "offsetY" | "rotation";

type CustomScreenSettings = {
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

type Settings = {
  screening: ScreeningMode;
  angleMode: AngleMode;
  customMode: boolean;
  customLocked: boolean;
  customByPlate: Record<number, CustomScreenSettings>;
  freq: number;
  brightness: number;
  contrast: number;
  ink: number;
  paperTexture: number;
  shift: number;
  showPaper: boolean;
};

type PaperProfile = {
  id: PaperId;
  name: string;
  hex: string;
  rgb: [number, number, number];
  grainAmount: number;
  grainScaleMM: number;
  fiberAmount: number;
  inkAcceptanceVariation: number;
};

type PresetState = {
  id: string;
  name: string;
  paperId: PaperId;
  plates: InkPlate[];
  settings: Settings;
  frameRatio: FrameRatio;
  frameFit: "cover" | "contain";
};

const defaultCustomScreen: CustomScreenSettings = {
  freq: 44,
  angle: 13,
  density: 0.94,
  opacity: 0.7,
  dotGain: 0.16,
  edgeGrain: 0.15,
  densityVar: 0,
  warp: 0.114,
  offsetX: 0.17,
  offsetY: -0.29,
  rotation: -0.057,
};

const inkPalette: InkColor[] = [
  { id: "black", name: "BLACK", hex: "#171717" },
  { id: "blue", name: "BLUE", hex: "#0078bf" },
  { id: "fluorescentPink", name: "FLUORESCENT PINK", hex: "#ff48b0" },
  { id: "green", name: "GREEN", hex: "#00a95c" },
  { id: "orange", name: "ORANGE", hex: "#ff6c2f" },
  { id: "red", name: "RED", hex: "#ff665e" },
  { id: "brightRed", name: "BRIGHT RED", hex: "#f15060" },
  { id: "yellow", name: "YELLOW", hex: "#ffe800" },
  { id: "burgundy", name: "BURGUNDY", hex: "#914e72" },
  { id: "teal", name: "TEAL", hex: "#00838a" },
  { id: "purple", name: "PURPLE", hex: "#765ba7" },
  { id: "brown", name: "BROWN", hex: "#925f52" },
  { id: "slate", name: "SLATE", hex: "#5f7180" },
  { id: "mediumBlue", name: "MEDIUM BLUE", hex: "#3255a4" },
  { id: "violet", name: "VIOLET", hex: "#9d7ad2" },
  { id: "cornflower", name: "CORNFLOWER", hex: "#62a8e5" },
  { id: "sunflower", name: "SUNFLOWER", hex: "#ffb511" },
];

const inkById = Object.fromEntries(inkPalette.map((ink) => [ink.id, ink])) as Record<InkId, InkColor>;
const initialPlates: InkPlate[] = [
  { id: 1, inkId: "fluorescentPink" },
  { id: 2, inkId: "blue" },
];

const defaultSettings: Settings = {
  screening: "screen",
  angleMode: "offset",
  customMode: false,
  customLocked: true,
  customByPlate: {
    1: { ...defaultCustomScreen },
    2: { ...defaultCustomScreen },
  },
  freq: 71,
  grainSizeMM: 0.45,
  brightness: 0,
  contrast: 0,
  ink: 84,
  paperTexture: 100,
  shift: 2,
  showPaper: true,
};

// These values are deliberately profile data, rather than cosmetic theme
// colours: the pipeline uses them for the paper base, texture and acceptance.
const paperProfiles: PaperProfile[] = [
  { id: "warmWhite", name: "Warm White", hex: "#F4EEDC", rgb: [244, 238, 220], grainAmount: 0.05, grainScaleMM: 0.35, fiberAmount: 0.5, inkAcceptanceVariation: 0.08 },
  { id: "natural", name: "Natural", hex: "#E9DFC8", rgb: [233, 223, 200], grainAmount: 0.05, grainScaleMM: 0.35, fiberAmount: 0.5, inkAcceptanceVariation: 0.08 },
  { id: "recycledGray", name: "Recycled Gray", hex: "#DDD8C9", rgb: [221, 216, 201], grainAmount: 0.055, grainScaleMM: 0.44, fiberAmount: 0.48, inkAcceptanceVariation: 0.105 },
  { id: "kraft", name: "Kraft", hex: "#BF9C6B", rgb: [191, 156, 107], grainAmount: 0.05, grainScaleMM: 0.55, fiberAmount: 0.62, inkAcceptanceVariation: 0.1 },
  { id: "white", name: "White", hex: "#FFFFFF", rgb: [255, 255, 255], grainAmount: 0, grainScaleMM: 0.35, fiberAmount: 0, inkAcceptanceVariation: 0.02 },
];

const paperById = Object.fromEntries(paperProfiles.map((paper) => [paper.id, paper])) as Record<PaperId, PaperProfile>;

function presetSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings, ...overrides, customByPlate: {} };
}

const builtInPresets: PresetState[] = [
  { id: "pink-blue", name: "Pink + Blue", paperId: "warmWhite", plates: [{ id: 1, inkId: "fluorescentPink" }, { id: 2, inkId: "blue" }], settings: presetSettings({ freq: 47, ink: 88, angleMode: "offset" }), frameRatio: "4:5", frameFit: "cover" },
  { id: "pink-blue-grain", name: "Pink + Blue Grain", paperId: "natural", plates: [{ id: 1, inkId: "fluorescentPink" }, { id: 2, inkId: "blue" }], settings: presetSettings({ screening: "grain", ink: 88 }), frameRatio: "4:5", frameFit: "cover" },
  { id: "red-black", name: "Red + Black", paperId: "recycledGray", plates: [{ id: 1, inkId: "red" }, { id: 2, inkId: "black" }], settings: presetSettings({ freq: 53, ink: 88, angleMode: "offset" }), frameRatio: "4:5", frameFit: "cover" },
  { id: "yellow-blue", name: "Yellow + Blue", paperId: "natural", plates: [{ id: 1, inkId: "yellow" }, { id: 2, inkId: "blue" }], settings: presetSettings({ freq: 49, ink: 86, angleMode: "offset" }), frameRatio: "4:5", frameFit: "cover" },
  { id: "black-pink", name: "Black + Pink", paperId: "kraft", plates: [{ id: 1, inkId: "black" }, { id: 2, inkId: "fluorescentPink" }], settings: presetSettings({ freq: 48, ink: 86, angleMode: "offset" }), frameRatio: "4:5", frameFit: "cover" },
  { id: "yellow-pink-blue", name: "Yellow + Pink + Blue", paperId: "natural", plates: [{ id: 1, inkId: "yellow" }, { id: 2, inkId: "fluorescentPink" }, { id: 3, inkId: "blue" }], settings: presetSettings({ freq: 45, ink: 84, angleMode: "rosette" }), frameRatio: "4:5", frameFit: "cover" },
  { id: "pink-blue-rosette", name: "Pink + Blue Rosette", paperId: "warmWhite", plates: [{ id: 1, inkId: "fluorescentPink" }, { id: 2, inkId: "blue" }], settings: presetSettings({ freq: 47, ink: 88, angleMode: "rosette" }), frameRatio: "4:5", frameFit: "cover" },
  { id: "yellow-red-blue", name: "Yellow + Red + Blue", paperId: "warmWhite", plates: [{ id: 1, inkId: "yellow" }, { id: 2, inkId: "red" }, { id: 3, inkId: "blue" }], settings: presetSettings({ freq: 46, ink: 86, angleMode: "rosette" }), frameRatio: "4:5", frameFit: "cover" },
];

const angleLabels: Record<AngleMode, string> = {
  dot: "Dot on Dot",
  offset: "Offset",
  rosette: "Rosette",
};

const angleDescription: Record<AngleMode, string> = {
  dot: "全インクを同じ格子へ重ねる",
  offset: "版ごとに微妙な角度差をつける",
  rosette: "複数角度でロゼットをつくる",
};

const offsetAngles = [0, 7.5, -7.5, 15, -15, 22.5];
const rosetteAngles = [15, 75, 0, 45, 30, 60];

function getScreenAngle(angleMode: AngleMode, plateIndex: number) {
  if (angleMode === "dot") return 0;
  if (angleMode === "rosette") return rosetteAngles[plateIndex % rosetteAngles.length];
  return offsetAngles[plateIndex % offsetAngles.length];
}

function hexToRgb(hex: string) {
  const numeric = Number.parseInt(hex.slice(1), 16);
  return { red: (numeric >> 16) & 255, green: (numeric >> 8) & 255, blue: numeric & 255 };
}

function rgbToHsv(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta !== 0) {
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { hue, saturation: maximum === 0 ? 0 : delta / maximum, value: maximum };
}

function drawSample(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sky = ctx.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, "#d6e3e3");
  sky.addColorStop(0.52, "#f2c9b9");
  sky.addColorStop(1, "#3f5554");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#253235";
  ctx.fillRect(width * 0.09, height * 0.35, width * 0.21, height * 0.65);
  ctx.fillRect(width * 0.36, height * 0.22, width * 0.18, height * 0.78);
  ctx.fillRect(width * 0.58, height * 0.42, width * 0.34, height * 0.58);
  ctx.fillStyle = "#f4bf81";
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      ctx.fillRect(width * (0.115 + column * 0.047), height * (0.41 + row * 0.1), width * 0.021, height * 0.052);
    }
  }
  ctx.fillStyle = "#e15d55";
  ctx.beginPath();
  ctx.arc(width * 0.49, height * 0.35, width * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c2629";
  ctx.beginPath();
  ctx.moveTo(width * 0.2, height * 0.89);
  ctx.lineTo(width * 0.42, height * 0.55);
  ctx.lineTo(width * 0.65, height * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f2ddd0";
  ctx.font = `700 ${Math.round(width * 0.095)}px sans-serif`;
  ctx.fillText("RISOGRAPH", width * 0.075, height * 0.14);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const exportWorkerRef = useRef<Worker | null>(null);
  const previewPipelineCacheRef = useRef<{ separationKey: string; screenKey: string; printKey: string; registrationKey: string; result: ReturnType<typeof renderPipeline> } | null>(null);
  const nextPlateIdRef = useRef(3);
  const [plates, setPlates] = useState<InkPlate[]>(initialPlates);
  const [activePlateId, setActivePlateId] = useState(1);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [imageState, setImageState] = useState<{ name: string; ready: boolean; revision: number }>({ name: "サンプルポスター", ready: true, revision: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState("写真を追加するか、サンプルで試せます。");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportScale, setExportScale] = useState<1 | 2 | 3>(1);
  const [exportMode, setExportMode] = useState<ExportMode>("image");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [separationStage, setSeparationStage] = useState<SeparationStage>("coverage");
  const [printPreset, setPrintPreset] = useState<"A6" | "A5" | "A4">("A4");
  const [frameRatio, setFrameRatio] = useState<FrameRatio>("4:5");
  const [frameFit, setFrameFit] = useState<"cover" | "contain">("cover");
  const [paperId, setPaperId] = useState<PaperId>("warmWhite");
  const [paperPickerOpen, setPaperPickerOpen] = useState(false);
  const [presetGalleryOpen, setPresetGalleryOpen] = useState(false);
  const [savedPresets, setSavedPresets] = useState<PresetState[]>([]);
  const [presetName, setPresetName] = useState("");
  const [previewZoom, setPreviewZoom] = useState<"fit" | 1 | 2 | 3>("fit");
  const [previewCanvasSize, setPreviewCanvasSize] = useState({ width: 540, height: 675 });
  const [previewStage, setPreviewStage] = useState<RenderStage>("composite");
  const [previewPlateIndex, setPreviewPlateIndex] = useState(0);
  const activePaper = paperById[paperId];

  const drawArtwork = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const image = imageRef.current;
    const frameRatios: Record<Exclude<FrameRatio, "original">, number> = { "1:1": 1, "4:5": 4 / 5, "3:4": 3 / 4, "2:3": 2 / 3, "9:16": 9 / 16, sqrt2: 1 / Math.SQRT2 };
    const sourceRatio = frameRatio === "original" ? (image ? image.naturalWidth / image.naturalHeight : 4 / 3) : frameRatios[frameRatio];
    // The working canvas is bounded by total pixels and edge length, never by
    // a minimum height. This keeps panoramic and very tall frames at exactly
    // the same aspect ratio as the preview/export frame.
    const { width, height } = calculateWorkSize(sourceRatio);
    canvas.width = width;
    canvas.height = height;
    setPreviewCanvasSize((current) => current.width === width && current.height === height ? current : { width, height });

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const source = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const ctx = canvas.getContext("2d");
    if (!source || !ctx) return;

    source.fillStyle = activePaper.hex;
    source.fillRect(0, 0, width, height);

    if (image) {
      const scale = (frameFit === "cover" ? Math.max : Math.min)(width / image.naturalWidth, height / image.naturalHeight);
      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
      source.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    } else {
      drawSample(source, width, height);
    }

    const enginePlates = plates.map((plate) => ({
      id: plate.id,
      inkId: plate.inkId,
      custom: settings.customMode ? { ...defaultCustomScreen, ...(settings.customByPlate[plate.id] ?? {}) } : undefined,
    }));
    const sourceImage = source.getImageData(0, 0, width, height);
    const plateSignature = enginePlates.map((plate) => `${plate.inkId}:${plate.custom?.density ?? 1}:${plate.custom?.opacity ?? 0.7}`).join("|");
    const separationKey = [imageState.revision, width, height, frameFit, paperId, settings.showPaper, plateSignature, settings.brightness, settings.contrast, settings.ink].join(":");
    const screenKey = [separationKey, settings.screening, settings.freq, settings.grainSizeMM, settings.angleMode, enginePlates.map((plate) => `${plate.custom?.freq ?? ""}:${plate.custom?.angle ?? ""}:${plate.custom?.dotGain ?? ""}`).join("|")].join(":");
    const printKey = [screenKey, settings.showPaper, settings.paperTexture, paperId, enginePlates.map((plate) => `${plate.custom?.edgeGrain ?? ""}:${plate.custom?.densityVar ?? ""}`).join("|")].join(":");
    const registrationKey = [printKey, settings.shift, enginePlates.map((plate) => `${plate.custom?.warp ?? ""}:${plate.custom?.offsetX ?? ""}:${plate.custom?.offsetY ?? ""}:${plate.custom?.rotation ?? ""}`).join("|")].join(":");
    const cached = previewPipelineCacheRef.current;
    const result = renderPipeline(sourceImage, enginePlates, {
      screening: settings.screening,
      angleMode: settings.angleMode,
      freq: settings.customMode ? defaultCustomScreen.freq : settings.freq,
      grainSizeMM: settings.grainSizeMM,
      brightness: settings.brightness,
      contrast: settings.contrast,
      ink: settings.ink,
      paperTexture: settings.paperTexture,
      shift: settings.shift,
      showPaper: settings.showPaper,
      paper: activePaper.rgb.map((channel) => channel / 255) as [number, number, number],
      paperGrainAmount: activePaper.grainAmount,
      paperGrainScaleMM: activePaper.grainScaleMM,
      paperFiberAmount: activePaper.fiberAmount,
      paperInkAcceptanceVariation: activePaper.inkAcceptanceVariation,
      coverageOverride: cached?.separationKey === separationKey ? cached.result.coverage : undefined,
      masterOverride: cached?.screenKey === screenKey ? cached.result.master : undefined,
      printedOverride: cached?.printKey === printKey ? cached.result.printed : undefined,
      registeredOverride: cached?.registrationKey === registrationKey ? cached.result.registered : undefined,
    });
    canvas.width = width;
    canvas.height = height;
    previewPipelineCacheRef.current = { separationKey, screenKey, printKey, registrationKey, result };
    ctx.putImageData(renderStageImage(result, sourceImage, enginePlates, {
      ...settings,
      paper: activePaper.rgb.map((channel) => channel / 255) as [number, number, number],
    }, previewStage, previewPlateIndex), 0, 0);
  }, [activePaper, frameFit, frameRatio, imageState.revision, paperId, plates, previewPlateIndex, previewStage, settings]);

  useEffect(() => {
    drawArtwork();
  }, [drawArtwork, imageState.revision]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    exportWorkerRef.current?.terminate();
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("inkloom.saved-presets.v1");
      if (!stored) return;
      const parsed = JSON.parse(stored) as PresetState[];
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((preset) => preset?.name && paperById[preset.paperId] && Array.isArray(preset.plates));
        const timer = window.setTimeout(() => setSavedPresets(valid), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // A malformed local preset must never prevent the editor from opening.
      window.localStorage.removeItem("inkloom.saved-presets.v1");
    }
  }, []);

  const loadFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("画像ファイル（JPG / PNG / WebP など）を選んでください。");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      // `ready` remains true when replacing an already-loaded image, so use a
      // revision token to force the canvas effect to run immediately.
      setImageState((current) => ({ name: file.name, ready: true, revision: current.revision + 1 }));
      setNotice("写真を読み込みました。スライダーで版の表情を整えてください。");
    };
    image.onerror = () => setNotice("この画像は読み込めませんでした。別のファイルをお試しください。");
    image.src = url;
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    // Allow choosing the same file again and still receive a change event.
    event.currentTarget.value = "";
  };
  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  };
  const updateSetting = (key: "freq" | "grainSizeMM" | "brightness" | "contrast" | "ink" | "paperTexture" | "shift", value: number) => setSettings((current) => ({ ...current, [key]: value }));
  const formatSigned = (value: number) => `${value >= 0 ? "+" : ""}${(value / 10).toFixed(1)}`;

  const setScreening = (screening: ScreeningMode) => {
    setSettings((current) => ({ ...current, screening }));
    setNotice(screening === "screen" ? "SCREEN：格子状の網点で階調を表現します。" : "GRAIN：ランダムな点描密度で階調を表現します。");
  };

  const setAngleMode = (angleMode: AngleMode) => {
    setSettings((current) => ({ ...current, angleMode }));
    setNotice(`${angleLabels[angleMode]}：${angleDescription[angleMode]}。`);
  };

  const toggleCustomMode = () => {
    const next = !settings.customMode;
    setSettings((current) => ({ ...current, customMode: next }));
    setNotice(next ? "版ごとの印刷パラメーターを編集できます。" : "版別設定を解除しました。");
  };

  const toggleCustomLock = () => {
    const next = !settings.customLocked;
    setSettings((current) => ({ ...current, customLocked: next }));
    setNotice(next ? "カスタム値を全インク版へ同期します。" : "カスタム値を選択中の版だけに適用します。");
  };

  const updateCustomSetting = (key: CustomScreenKey, value: number) => {
    setSettings((current) => {
      const targetIds = current.customLocked ? plates.map((plate) => plate.id) : [activePlateId];
      const customByPlate = { ...current.customByPlate };
      targetIds.forEach((plateId) => {
        customByPlate[plateId] = { ...defaultCustomScreen, ...customByPlate[plateId], [key]: value };
      });
      return { ...current, customByPlate };
    });
  };

  const selectPaper = (nextPaperId: PaperId) => {
    setPaperId(nextPaperId);
    setPaperPickerOpen(false);
    setSettings((current) => ({ ...current, showPaper: true }));
    setNotice(`${paperById[nextPaperId].name} の紙プロファイルを適用しました。紙色・粒子・繊維・インク受容性を再計算します。`);
  };

  const applyPreset = (preset: PresetState) => {
    const normalized = normalizePresetState(preset, defaultCustomScreen, defaultSettings) as { plates: InkPlate[]; settings: Settings };
    const normalizedPlates = normalized.plates.map((plate) => ({ ...plate, inkId: inkById[plate.inkId] ? plate.inkId : "black" as InkId }));
    if (!normalizedPlates.length) return;
    setPlates(normalizedPlates);
    setActivePlateId(normalizedPlates[0].id);
    nextPlateIdRef.current = normalizedPlates.length + 1;
    setSettings(normalized.settings);
    setPaperId(paperById[preset.paperId] ? preset.paperId : "warmWhite");
    setFrameRatio(preset.frameRatio ?? "4:5");
    setFrameFit(preset.frameFit ?? "cover");
    setPresetGalleryOpen(false);
    setNotice(`${preset.name} を適用しました。入力画像はそのまま保持されています。`);
  };

  const savePreset = () => {
    const name = presetName.trim() || `MY PRESET ${savedPresets.length + 1}`;
    const preset: PresetState = {
      id: `saved-${Date.now()}`,
      name,
      paperId,
      plates: plates.map((plate) => ({ ...plate })),
      settings: { ...settings, customByPlate: { ...settings.customByPlate } },
      frameRatio,
      frameFit,
    };
    const next = [...savedPresets, preset].slice(-12);
    setSavedPresets(next);
    setPresetName("");
    window.localStorage.setItem("inkloom.saved-presets.v1", JSON.stringify(next));
    setNotice(`${name} をこのブラウザに保存しました。`);
  };

  const deleteSavedPreset = (presetId: string) => {
    const next = savedPresets.filter((preset) => preset.id !== presetId);
    setSavedPresets(next);
    window.localStorage.setItem("inkloom.saved-presets.v1", JSON.stringify(next));
  };

  const selectInk = (inkId: InkId) => {
    setPlates((current) => current.map((plate) => plate.id === activePlateId ? { ...plate, inkId } : plate));
    setNotice(`選択中の版を ${inkById[inkId].name} に変更しました。`);
  };

  const addPlate = () => {
    if (plates.length >= 6) {
      setNotice("インク版は最大6色まで追加できます。");
      return;
    }
    const usedInks = new Set(plates.map((plate) => plate.inkId));
    const nextInk = inkPalette.find((ink) => !usedInks.has(ink.id)) ?? inkPalette[plates.length % inkPalette.length];
    const newPlate = { id: nextPlateIdRef.current, inkId: nextInk.id };
    nextPlateIdRef.current += 1;
    setPlates((current) => [...current, newPlate]);
    setSettings((current) => ({
      ...current,
      customByPlate: { ...current.customByPlate, [newPlate.id]: { ...defaultCustomScreen } },
    }));
    setActivePlateId(newPlate.id);
    setNotice(`${nextInk.name} の版を追加しました。`);
  };

  const removePlate = (plateId: number) => {
    if (plates.length === 1) {
      setNotice("少なくとも1つのインク版が必要です。");
      return;
    }
    const plateIndex = plates.findIndex((plate) => plate.id === plateId);
    const nextActive = plates[plateIndex - 1] ?? plates[plateIndex + 1];
    setPlates((current) => current.filter((plate) => plate.id !== plateId));
    if (activePlateId === plateId && nextActive) setActivePlateId(nextActive.id);
    setNotice("インク版を削除しました。");
  };

  const autoSelectInks = () => {
    const image = imageRef.current;
    if (!image) {
      const sampleOrder: InkId[] = ["fluorescentPink", "blue", "yellow", "green", "orange", "black"];
      setPlates((current) => current.map((plate, index) => ({ ...plate, inkId: sampleOrder[index] })));
      setNotice("サンプルに合うインク構成を自動設定しました。");
      return;
    }

    const analysisCanvas = document.createElement("canvas");
    analysisCanvas.width = 72;
    analysisCanvas.height = 72;
    const analysis = analysisCanvas.getContext("2d", { willReadFrequently: true });
    if (!analysis) return;
    analysis.drawImage(image, 0, 0, 72, 72);
    const pixels = analysis.getImageData(0, 0, 72, 72).data;
    const hueBins = Array.from({ length: 24 }, (_, index) => ({ hue: index * 15 + 7.5, score: 0 }));

    for (let index = 0; index < pixels.length; index += 16) {
      const hsv = rgbToHsv(pixels[index], pixels[index + 1], pixels[index + 2]);
      if (hsv.saturation < 0.12 || hsv.value < 0.08 || hsv.value > 0.98) continue;
      const bin = Math.floor(hsv.hue / 15) % hueBins.length;
      hueBins[bin].score += hsv.saturation * (0.35 + hsv.value * 0.65);
    }

    const prominentHues = hueBins.sort((a, b) => b.score - a.score).map((bin) => bin.hue);
    const available = [...inkPalette.filter((ink) => ink.id !== "black")];
    const selected: InkId[] = [];
    for (const hue of prominentHues) {
      if (selected.length >= plates.length) break;
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      available.forEach((ink, index) => {
        const rgb = hexToRgb(ink.hex);
        const inkHue = rgbToHsv(rgb.red, rgb.green, rgb.blue).hue;
        const rawDistance = Math.abs(hue - inkHue);
        const distance = Math.min(rawDistance, 360 - rawDistance);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      if (bestIndex >= 0) selected.push(available.splice(bestIndex, 1)[0].id);
    }
    while (selected.length < plates.length) selected.push((available.shift() ?? inkById.black).id);
    setPlates((current) => current.map((plate, index) => ({ ...plate, inkId: selected[index] })));
    setNotice("画像の主要な色相から、近いリソグラフインクを自動選択しました。");
  };

  const reset = () => {
    setSettings({ ...defaultSettings, customByPlate: { 1: { ...defaultCustomScreen }, 2: { ...defaultCustomScreen } } });
    setPlates(initialPlates.map((plate) => ({ ...plate })));
    setActivePlateId(1);
    setPaperId("warmWhite");
    setPaperPickerOpen(false);
    setFrameRatio("4:5");
    setFrameFit("cover");
    setPreviewZoom("fit");
    setPreviewStage("composite");
    setPreviewPlateIndex(0);
    nextPlateIdRef.current = 3;
    setNotice("設定を初期状態に戻しました。");
  };

  const frameRatioValue = () => {
    if (frameRatio === "original") return imageRef.current ? imageRef.current.naturalWidth / imageRef.current.naturalHeight : 4 / 3;
    return ({ "1:1": 1, "4:5": 4 / 5, "3:4": 3 / 4, "2:3": 2 / 3, "9:16": 9 / 16, sqrt2: 1 / Math.SQRT2 } as Record<Exclude<FrameRatio, "original">, number>)[frameRatio];
  };

  const exportDimensions = (mode: ExportMode = exportMode, scale: 1 | 2 | 3 = exportScale) => {
    const ratio = frameRatioValue();
    if (mode === "image") {
      const longEdge = 1600 * scale;
      return ratio >= 1
        ? { width: longEdge, height: Math.max(1, Math.round(longEdge / ratio)), dpi: 300 }
        : { width: Math.max(1, Math.round(longEdge * ratio)), height: longEdge, dpi: 300 };
    }
    const paper = printPreset === "A6" ? [105, 148] : printPreset === "A5" ? [148, 210] : [210, 297];
    const paperRatio = paper[0] / paper[1];
    const widthMM = ratio <= paperRatio ? paper[1] * ratio : paper[0];
    const heightMM = ratio <= paperRatio ? paper[1] : paper[0] / ratio;
    return { width: Math.round((widthMM / 25.4) * 300), height: Math.round((heightMM / 25.4) * 300), dpi: 300 };
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const canvasBytes = async (data: Uint8ClampedArray, width: number, height: number, channels: number, format: ExportFormat = "png") => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    const rgba = channels === 4 ? data : (() => {
      const expanded = new Uint8ClampedArray(width * height * 4);
      for (let pixel = 0; pixel < data.length; pixel += 1) {
        const offset = pixel * 4;
        expanded[offset] = expanded[offset + 1] = expanded[offset + 2] = data[pixel];
        expanded[offset + 3] = 255;
      }
      return expanded;
    })();
    context.putImageData(new ImageData(rgba, width, height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("encode")), format === "jpeg" ? "image/jpeg" : "image/png", 0.94));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return format === "png" ? setPngDpi(bytes, 300) : setJpegDpi(bytes, 300);
  };

  const buildExportSource = (width: number, height: number) => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const source = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!source) return null;
    source.fillStyle = activePaper.hex;
    source.fillRect(0, 0, width, height);
    const image = imageRef.current;
    if (image) {
      const scale = (frameFit === "cover" ? Math.max : Math.min)(width / image.naturalWidth, height / image.naturalHeight);
      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
      source.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    } else {
      drawSample(source, width, height);
    }
    return source.getImageData(0, 0, width, height);
  };

  const exportNow = async (overrides?: { mode?: ExportMode; scale?: 1 | 2 | 3 }) => {
    if (exportBusy) return;
    const mode = overrides?.mode ?? exportMode;
    const scale = overrides?.scale ?? exportScale;
    setExportMenuOpen(false);
    setExportBusy(true);
    setExportProgress(0);
    setNotice("指定した出力サイズで、処理を再計算しています…");
    try {
      const dimensions = exportDimensions(mode, scale);
      const source = buildExportSource(dimensions.width, dimensions.height);
      if (!source) throw new Error("source");
      const enginePlates = plates.map((plate) => ({
        id: plate.id,
        inkId: plate.inkId,
        custom: settings.customMode ? { ...defaultCustomScreen, ...(settings.customByPlate[plate.id] ?? {}) } : undefined,
      }));
      const stages = mode === "separations"
        ? enginePlates.map((_plate, plateIndex) => ({ stage: separationStage as RenderStage, plateIndex, key: `plate-${plateIndex}` }))
        : [{ stage: "composite" as RenderStage, plateIndex: 0, key: "composite" }];
      const worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
      exportWorkerRef.current = worker;
      const outputs = await new Promise<Record<string, { data: Uint8ClampedArray; channels: number }>>((resolve, reject) => {
        worker.onmessage = (event) => {
          if (event.data.type === "progress") setExportProgress(event.data.progress);
          if (event.data.type === "done") resolve(event.data.outputs);
          if (event.data.type === "cancelled") reject(new DOMException("Cancelled", "AbortError"));
        };
        worker.onerror = () => reject(new Error("worker"));
        worker.postMessage({
          type: "render",
          width: dimensions.width,
          height: dimensions.height,
          source: source.data,
          plates: enginePlates,
          settings: {
            ...settings,
            paper: activePaper.rgb.map((channel) => channel / 255) as [number, number, number],
            paperGrainAmount: activePaper.grainAmount,
            paperGrainScaleMM: activePaper.grainScaleMM,
            paperFiberAmount: activePaper.fiberAmount,
            paperInkAcceptanceVariation: activePaper.inkAcceptanceVariation,
            quality: "export",
          },
          stages,
        }, [source.data.buffer]);
      });
      worker.terminate();
      exportWorkerRef.current = null;
      if (mode === "separations") {
        const files: Record<string, Uint8Array> = {};
        for (let index = 0; index < enginePlates.length; index += 1) {
          const output = outputs[`plate-${index}`];
          files[`plate-${String(index + 1).padStart(2, "0")}-${enginePlates[index].inkId}-${separationStage}.png`] = await canvasBytes(output.data, dimensions.width, dimensions.height, output.channels);
        }
        files["README.txt"] = new TextEncoder().encode(`INKLOOM separations\nStage: ${separationStage}\nSize: ${dimensions.width} x ${dimensions.height}px\nResolution: 300 DPI\n`);
        downloadBlob(new Blob([createZip(files) as BlobPart], { type: "application/zip" }), `inkloom-${separationStage}-${dimensions.width}x${dimensions.height}.zip`);
        setNotice(`${plates.length}版の${separationStage}を300 DPI PNG／ZIPで書き出しました。`);
      } else {
        const output = outputs.composite;
        const bytes = await canvasBytes(output.data, dimensions.width, dimensions.height, output.channels, exportFormat);
        downloadBlob(new Blob([bytes as BlobPart], { type: exportFormat === "jpeg" ? "image/jpeg" : "image/png" }), `inkloom-${printPreset}-${dimensions.width}x${dimensions.height}.${exportFormat}`);
        setNotice(`${dimensions.width}×${dimensions.height}px / 300 DPIで書き出しました。`);
      }
      setExportDialogOpen(false);
    } catch (error) {
      setNotice(error instanceof DOMException && error.name === "AbortError" ? "書き出しをキャンセルしました。" : "書き出しに失敗しました。出力サイズを下げてもう一度お試しください。");
    } finally {
      exportWorkerRef.current?.terminate();
      exportWorkerRef.current = null;
      setExportBusy(false);
      setExportProgress(0);
    }
  };

  const cancelExport = () => {
    exportWorkerRef.current?.postMessage({ type: "cancel" });
    setNotice("現在のタイルが終わり次第、書き出しを中止します…");
  };

  const quickExport = (scale: 1 | 2 | 3) => {
    setExportScale(scale);
    setExportMode("image");
    window.setTimeout(() => exportNow({ mode: "image", scale }), 0);
  };

  const activePlate = plates.find((plate) => plate.id === activePlateId) ?? plates[0];
  const activeCustom = { ...defaultCustomScreen, ...(settings.customByPlate[activePlate.id] ?? {}) };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="topbar-start">
          <a className="brand" href="#studio" aria-label="INKLOOM ホーム"><span className="brand-mark">◎</span><span>INKLOOM</span></a>
          <nav className="mode-tabs" aria-label="編集モード"><button className="active">IMAGE</button><button onClick={() => setPresetGalleryOpen(true)}>PRESET</button></nav>
        </div>
        <p>INKLOOM / PRINT LAB</p>
        <div className="export-wrap">
          <button className="download top-download" onClick={() => setExportMenuOpen((open) => !open)} aria-expanded={exportMenuOpen}>EXPORT <span aria-hidden="true">↗</span></button>
          {exportMenuOpen && (
            <div className="export-menu" role="menu">
              <button onClick={() => quickExport(1)}>1×（長辺 1,600px）</button>
              <button onClick={() => quickExport(2)}>2×（長辺 3,200px）</button>
              <button onClick={() => quickExport(3)}>3×（長辺 4,800px）</button>
              <div className="menu-divider" />
              <button onClick={() => { setExportMenuOpen(false); setExportDialogOpen(true); }}>詳細な書き出し…</button>
            </div>
          )}
        </div>
      </header>

      <section className="studio" id="studio">
        <aside className="control-panel" aria-label="加工設定">
          <div className="panel-heading">
            <p className="eyebrow">IMAGE / SOURCE</p>
            <h1>INPUT <em>IMAGE</em></h1>
            <p className="intro">写真を1〜6色のインク版へ分解します。データはこのブラウザから外へ出ません。</p>
          </div>

          <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={onFileChange} />
          <button
            className={`upload-zone ${isDragging ? "is-dragging" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <span className="upload-icon" aria-hidden="true">↑</span>
            <span><strong>写真を選ぶ</strong><small>またはここへドロップ</small></span>
            <span className="file-type">JPG · PNG · WEBP</span>
          </button>
          <p className="source-name"><span>●</span> {imageState.name}</p>

          <div className="ink-editor">
            <div className="section-label"><span>INK LAYERS</span><small>{plates.length} / 6 COLORS</small></div>
            <div className="ink-tabs" role="tablist" aria-label="使用するインク版">
              {plates.map((plate, plateIndex) => {
                const ink = inkById[plate.inkId];
                const isActive = plate.id === activePlate.id;
                return (
                  <div className={`ink-tab ${isActive ? "selected" : ""}`} key={plate.id}>
                    <button
                      className="ink-tab-select"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="ink-palette"
                      onClick={() => setActivePlateId(plate.id)}
                    >
                      <i style={{ background: ink.hex }} aria-hidden="true" />
                      <span>{ink.name}</span>
                      <small>{settings.screening === "grain" ? "GRAIN" : `${getScreenAngle(settings.angleMode, plateIndex)}°`}</small>
                    </button>
                    <button className="ink-tab-remove" onClick={() => removePlate(plate.id)} aria-label={`${ink.name} の版を削除`}>×</button>
                  </div>
                );
              })}
              <button className="add-ink" onClick={addPlate} disabled={plates.length >= 6} aria-label="インク版を追加">＋ <span>INK</span></button>
            </div>
            <div className="ink-palette" id="ink-palette" role="tabpanel" aria-label={`${inkById[activePlate.inkId].name} の色を変更`}>
              <button className="auto-ink" onClick={autoSelectInks} title="画像を解析して、すべての版に近いインク色を自動設定します">
                <span>A</span><small>AUTO</small>
              </button>
              {inkPalette.map((ink) => (
                <button
                  key={ink.id}
                  className={`ink-swatch ${activePlate.inkId === ink.id ? "selected" : ""}`}
                  style={{ "--swatch-color": ink.hex } as CSSProperties}
                  onClick={() => selectInk(ink.id)}
                  aria-label={ink.name}
                  aria-pressed={activePlate.inkId === ink.id}
                  title={ink.name}
                ><span aria-hidden="true" /></button>
              ))}
            </div>
            <p className="palette-help"><b>AUTO</b> は画像の主要色から全版のインク候補を選びます。各タブを選ぶと手動で上書きできます。</p>
          </div>

          <div className="control-section tone-controls">
            <div className="section-label"><span>TONE</span><small>{settings.customMode ? "CUSTOM SCREEN" : settings.screening === "screen" ? "SCREENING" : "POINTILLISM"}</small></div>
            <div className="tone-mode-row" role="group" aria-label="ドット配列モード">
              <button className={`tone-mode ${settings.screening === "screen" ? "selected" : ""}`} onClick={() => setScreening("screen")} aria-pressed={settings.screening === "screen"}>▦ SCREEN</button>
              <button className={`tone-mode ${settings.screening === "grain" ? "selected" : ""}`} onClick={() => setScreening("grain")} aria-pressed={settings.screening === "grain"}>⠿ GRAIN</button>
              <div className="paper-picker">
                <button className={`tone-mode paper-mode ${settings.showPaper ? "selected" : ""}`} onClick={() => setPaperPickerOpen((open) => !open)} aria-expanded={paperPickerOpen}>▣ PAPER</button>
                {paperPickerOpen && (
                  <div className="paper-menu" role="menu" aria-label="紙プロファイル">
                    <p>PAPER PROFILE</p>
                    <button className={!settings.showPaper ? "selected" : ""} onClick={() => { setSettings((current) => ({ ...current, showPaper: false })); setPaperPickerOpen(false); }} role="menuitem">
                      <i style={{ background: "#fff" }} aria-hidden="true" /><span>Paper Off</span><small>WHITE BASE</small>
                    </button>
                    {paperProfiles.map((paper) => (
                      <button key={paper.id} className={paperId === paper.id ? "selected" : ""} onClick={() => selectPaper(paper.id)} role="menuitem">
                        <i style={{ background: paper.hex }} aria-hidden="true" />
                        <span>{paper.name}</span>
                        <small>{Math.round(paper.grainAmount * 100)}% GRAIN</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="paper-profile-summary"><b>{activePaper.name}</b> · {activePaper.hex} · 粒子 {activePaper.grainAmount * 100}% / 繊維 {activePaper.fiberAmount * 100}%</p>

            <div className="custom-mode-bar">
              <button className={`custom-mode-toggle ${settings.customMode ? "selected" : ""}`} onClick={toggleCustomMode} aria-pressed={settings.customMode}>
                <span>▦ PLATE SETTINGS</span><small>{settings.customMode ? "ON" : "OFF"}</small>
              </button>
              {settings.customMode && (
                <button className="custom-lock" onClick={toggleCustomLock} aria-pressed={settings.customLocked} title={settings.customLocked ? "全インク版へ同期中" : "選択中の版だけを編集"}>
                  {settings.customLocked ? "▣" : "▱"}
                </button>
              )}
            </div>

            {settings.customMode ? (
              <div className="custom-grid" aria-label="カスタムスクリーン設定">
                {settings.screening === "screen" && <label className="custom-control custom-control-wide"><span>FREQ <output>{activeCustom.freq} lpi</output></span><input type="range" min="24" max="90" value={activeCustom.freq} onChange={(event) => updateCustomSetting("freq", Number(event.target.value))} /><small>網点の細かさ。ロック中は全版へ同期</small></label>}
                {settings.screening === "screen" && <label className="custom-control"><span>ANGLE <output>{activeCustom.angle}°</output></span><input type="range" min="0" max="90" value={activeCustom.angle} onChange={(event) => updateCustomSetting("angle", Number(event.target.value))} /><small>格子だけの回転角</small></label>}
                <label className="custom-control"><span>DENSITY <output>{activeCustom.density.toFixed(2)}</output></span><input type="range" min="0.2" max="1.4" step="0.01" value={activeCustom.density} onChange={(event) => updateCustomSetting("density", Number(event.target.value))} /><small>インク量の基準</small></label>
                <label className="custom-control"><span>OPACITY <output>{activeCustom.opacity.toFixed(2)}</output></span><input type="range" min="0.2" max="1" step="0.01" value={activeCustom.opacity} onChange={(event) => updateCustomSetting("opacity", Number(event.target.value))} /><small>重なりの濃さ</small></label>
                <label className="custom-control"><span>DOT GAIN <output>{activeCustom.dotGain.toFixed(2)}</output></span><input type="range" min="0" max="0.45" step="0.01" value={activeCustom.dotGain} onChange={(event) => updateCustomSetting("dotGain", Number(event.target.value))} /><small>濃部での点の膨らみ</small></label>
                <label className="custom-control"><span>EDGE GRAIN <output>{activeCustom.edgeGrain.toFixed(2)}</output></span><input type="range" min="0" max="0.5" step="0.01" value={activeCustom.edgeGrain} onChange={(event) => updateCustomSetting("edgeGrain", Number(event.target.value))} /><small>点の輪郭の揺らぎ</small></label>
                <label className="custom-control"><span>DENSITY VAR <output>{activeCustom.densityVar.toFixed(2)}</output></span><input type="range" min="0" max="0.4" step="0.01" value={activeCustom.densityVar} onChange={(event) => updateCustomSetting("densityVar", Number(event.target.value))} /><small>インク濃度の微細なムラ</small></label>
                <label className="custom-control"><span>WARP <output>{activeCustom.warp.toFixed(3)} mm</output></span><input type="range" min="0" max="0.3" step="0.001" value={activeCustom.warp} onChange={(event) => updateCustomSetting("warp", Number(event.target.value))} /><small>紙送りによる揺らぎ</small></label>
                <label className="custom-control"><span>OFFSET X <output>{activeCustom.offsetX.toFixed(2)} mm</output></span><input type="range" min="-0.5" max="0.5" step="0.01" value={activeCustom.offsetX} onChange={(event) => updateCustomSetting("offsetX", Number(event.target.value))} /><small>版の水平方向の位置</small></label>
                <label className="custom-control"><span>OFFSET Y <output>{activeCustom.offsetY.toFixed(2)} mm</output></span><input type="range" min="-0.5" max="0.5" step="0.01" value={activeCustom.offsetY} onChange={(event) => updateCustomSetting("offsetY", Number(event.target.value))} /><small>版の垂直方向の位置</small></label>
                <label className="custom-control"><span>ROTATION <output>{activeCustom.rotation.toFixed(3)}°</output></span><input type="range" min="-1" max="1" step="0.001" value={activeCustom.rotation} onChange={(event) => updateCustomSetting("rotation", Number(event.target.value))} /><small>版のわずかな回転</small></label>
              </div>
            ) : (
            <div className="tone-grid">
              <label className={`tone-control ${settings.screening === "grain" ? "is-disabled" : ""}`}>
                <span>FREQ <output>{settings.freq} lpi</output></span>
                <input type="range" min="24" max="90" value={settings.freq} disabled={settings.screening === "grain"} onChange={(event) => updateSetting("freq", Number(event.target.value))} />
                <small>網点の細かさ（大きいほど細かい）</small>
              </label>
              {settings.screening === "grain" && <label className="tone-control"><span>GRAIN SIZE <output>{settings.grainSizeMM.toFixed(2)} mm</output></span><input type="range" min="0.15" max="1.2" step="0.01" value={settings.grainSizeMM} onChange={(event) => updateSetting("grainSizeMM", Number(event.target.value))} /><small>点描粒子の物理サイズ</small></label>}
              <label className={`tone-control ${settings.screening === "grain" ? "is-disabled" : ""}`}>
                <span>ANGLE <output>{angleLabels[settings.angleMode]}</output></span>
                <select value={settings.angleMode} disabled={settings.screening === "grain"} onChange={(event) => setAngleMode(event.target.value as AngleMode)} aria-label="スクリーン角度方式">
                  <option value="dot">Dot on Dot</option>
                  <option value="offset">Offset</option>
                  <option value="rosette">Rosette</option>
                </select>
                <small>{angleDescription[settings.angleMode]}</small>
              </label>
              <label className="tone-control">
                <span>BRIGHTNESS <output>{formatSigned(settings.brightness)}</output></span>
                <input type="range" min="-20" max="20" value={settings.brightness} onChange={(event) => updateSetting("brightness", Number(event.target.value))} />
                <small>全体の明るさ</small>
              </label>
              <label className="tone-control">
                <span>CONTRAST <output>{formatSigned(settings.contrast)}</output></span>
                <input type="range" min="-20" max="20" value={settings.contrast} onChange={(event) => updateSetting("contrast", Number(event.target.value))} />
                <small>明暗のメリハリ</small>
              </label>
            </div>
            )}
            <p className="tone-help">{settings.customMode ? "PLATE SETTINGSは濃度・不透明度・ドットゲイン・版ズレを版ごとに調整します。SCREENでは周波数と角度も設定できます。" : settings.screening === "screen" ? "SCREENは格子状のドット。像の形は固定したまま、版ごとに格子だけを回転させます。濃い部分ほど点が大きくなり、FREQが大きいほど細かくなります。" : "GRAINは点描のカケアミ。GRAIN SIZEで粒径を決め、版の濃度・不透明度・版ズレはPLATE SETTINGSから編集できます。"}</p>
          </div>

          <div className="control-section sliders">
            <div className="section-label"><span>PRESS SETTINGS</span><small>LIVE</small></div>
            <label className="range-row">
              <span>インクの濃さ<output>{settings.ink}</output></span>
              <input type="range" min="45" max="100" value={settings.ink} onChange={(event) => updateSetting("ink", Number(event.target.value))} />
            </label>
            <label className="range-row">
              <span>紙質の強さ<output>{settings.paperTexture}%</output></span>
              <input type="range" min="0" max="150" value={settings.paperTexture} disabled={!settings.showPaper} onChange={(event) => updateSetting("paperTexture", Number(event.target.value))} />
            </label>
            <label className="range-row">
              <span>版ズレ<output>{settings.shift}</output></span>
              <input type="range" min="0" max="12" value={settings.shift} onChange={(event) => updateSetting("shift", Number(event.target.value))} />
            </label>
          </div>

          <div className="control-section frame-controls">
            <div className="section-label"><span>FRAME</span><small>PREVIEW CANVAS</small></div>
            <div className="frame-ratios" role="group" aria-label="プレビューのフレーム比率">
              {(["original", "1:1", "4:5", "3:4", "2:3", "9:16", "sqrt2"] as FrameRatio[]).map((ratio) => (
                <button key={ratio} className={frameRatio === ratio ? "selected" : ""} onClick={() => setFrameRatio(ratio)} aria-pressed={frameRatio === ratio}>{ratio === "original" ? "ORIG" : ratio === "sqrt2" ? "√2" : ratio}</button>
              ))}
            </div>
            <div className="frame-fit" role="group" aria-label="画像のフレーム内配置">
              <button className={frameFit === "cover" ? "selected" : ""} onClick={() => setFrameFit("cover")} aria-pressed={frameFit === "cover"}>CROP</button>
              <button className={frameFit === "contain" ? "selected" : ""} onClick={() => setFrameFit("contain")} aria-pressed={frameFit === "contain"}>FIT</button>
            </div>
            <p className="frame-help">入力画像の解像度に関係なく、このフレーム比率を基準にプレビューを再計算します。</p>
          </div>

          <div className="panel-actions">
            <button className="reset" onClick={reset}>初期化</button>
            <button className="download mobile-download" onClick={() => { setExportMode("image"); setExportDialogOpen(true); }}>PNGを保存 <span aria-hidden="true">↗</span></button>
          </div>
        </aside>

        <section className="preview-panel" aria-label="仕上がりプレビュー">
          <div className="print-meta"><span>LIVE PROOF / {frameRatio === "original" ? "ORIG" : frameRatio === "sqrt2" ? "√2" : frameRatio} / {String(plates.length).padStart(2, "0")} COLORS</span><span>{plates.map((plate) => inkById[plate.inkId].name).join(" + ")}</span></div>
          <div className="stage-inspector">
            <select value={previewStage} onChange={(event) => setPreviewStage(event.target.value as RenderStage)} aria-label="表示する処理工程">
              <option value="original">ORIGINAL</option><option value="tone">TONE</option><option value="gamut">GAMUT</option><option value="coverage">COVERAGE</option><option value="master">MASTER</option><option value="printed">PRINTED</option><option value="registered">REGISTERED</option><option value="composite">COMPOSITE</option>
            </select>
            {(["coverage", "master", "printed", "registered"] as RenderStage[]).includes(previewStage) && <select value={previewPlateIndex} onChange={(event) => setPreviewPlateIndex(Number(event.target.value))} aria-label="表示するインク版">{plates.map((plate, index) => <option key={plate.id} value={index}>PLATE {index + 1} / {inkById[plate.inkId].name}</option>)}</select>}
          </div>
          <div className={`paper-stage ${previewZoom === "fit" ? "is-fit" : "is-zoomed"}`}>
            <div className="preview-zoom" role="group" aria-label="プレビューの表示倍率">
              <button className={previewZoom === "fit" ? "selected" : ""} onClick={() => setPreviewZoom("fit")} aria-pressed={previewZoom === "fit"}>FIT</button>
              <button className={previewZoom === 1 ? "selected" : ""} onClick={() => setPreviewZoom(1)} aria-pressed={previewZoom === 1}>100%</button>
              <button className={previewZoom === 2 ? "selected" : ""} onClick={() => setPreviewZoom(2)} aria-pressed={previewZoom === 2}>200%</button>
              <button className={previewZoom === 3 ? "selected" : ""} onClick={() => setPreviewZoom(3)} aria-pressed={previewZoom === 3}>300%</button>
            </div>
            <canvas
              ref={canvasRef}
              aria-label="リソグラフ風加工プレビュー"
              style={previewZoom === "fit" ? undefined : { width: `${previewCanvasSize.width * previewZoom}px`, height: `${previewCanvasSize.height * previewZoom}px` }}
            />
          </div>
          <div className="proof-footer">
            <p><b>TIP</b> 選んだインクごとに網点の角度を変え、版を重ねています。インクが交差する発色を調整してみてください。</p>
            <span>{imageState.ready ? "PROCESSING ON DEVICE" : "LOADING"}</span>
          </div>
        </section>
      </section>
      {presetGalleryOpen && (
        <div className="preset-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPresetGalleryOpen(false); }}>
          <section className="preset-gallery" role="dialog" aria-modal="true" aria-labelledby="preset-title">
            <header className="preset-header">
              <div><p>PRESET LIBRARY</p><h2 id="preset-title">PRINT <em>RECIPES</em></h2></div>
              <button onClick={() => setPresetGalleryOpen(false)}>CLOSE</button>
            </header>
            <div className="preset-save">
              <div><b>SAVE CURRENT STATE</b><span>インク・紙・網点・フレーム設定をこのブラウザへ保存します。</span></div>
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={`MY PRESET ${savedPresets.length + 1}`} maxLength={36} aria-label="保存するプリセット名" />
              <button onClick={savePreset}>SAVE PRESET</button>
            </div>
            {savedPresets.length > 0 && (
              <section className="preset-section" aria-labelledby="saved-presets-title">
                <h3 id="saved-presets-title">SAVED / THIS BROWSER</h3>
                <div className="preset-grid">
                  {savedPresets.map((preset) => <PresetCard key={preset.id} preset={preset} saved onApply={applyPreset} onDelete={deleteSavedPreset} />)}
                </div>
              </section>
            )}
            <section className="preset-section" aria-labelledby="built-in-presets-title">
              <h3 id="built-in-presets-title">STARTING RECIPES</h3>
              <div className="preset-grid">
                {builtInPresets.map((preset) => <PresetCard key={preset.id} preset={preset} onApply={applyPreset} />)}
              </div>
            </section>
          </section>
        </div>
      )}
      {exportDialogOpen && (
        <div className="export-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportDialogOpen(false); }}>
          <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
            <h2 id="export-title">EXPORT / OUTPUT</h2>
            <p>入力画像の解像度ではなく、指定した仕上がりサイズで同じ変換パイプラインを再計算します。</p>
            <div className="export-options">
              <label>MODE<select value={exportMode} onChange={(event) => setExportMode(event.target.value as ExportMode)}><option value="image">画像（完成イメージ）</option><option value="print">印刷サイズ（300 DPI）</option><option value="separations">分版（各インクを個別PNG）</option></select></label>
              {exportMode === "image" && <label>SCALE<select value={exportScale} onChange={(event) => setExportScale(Number(event.target.value) as 1 | 2 | 3)}><option value="1">1×（長辺 1,600px）</option><option value="2">2×（長辺 3,200px）</option><option value="3">3×（長辺 4,800px）</option></select></label>}
              {exportMode !== "image" && <label>SIZE<select value={printPreset} onChange={(event) => setPrintPreset(event.target.value as "A6" | "A5" | "A4")}><option value="A6">A6 / 105 × 148 mm</option><option value="A5">A5 / 148 × 210 mm</option><option value="A4">A4 / 210 × 297 mm</option></select></label>}
              {exportMode !== "separations" && <label>FORMAT<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}><option value="png">PNG</option><option value="jpeg">JPG</option></select></label>}
              {exportMode === "separations" && <label>PLATE DATA<select value={separationStage} onChange={(event) => setSeparationStage(event.target.value as SeparationStage)}><option value="coverage">連続階調版 / Coverage</option><option value="master">網点マスター / Master</option><option value="registered">印刷シミュレーション版 / Registered</option></select></label>}
            </div>
            {exportBusy && <div className="export-progress"><span style={{ width: `${exportProgress}%` }} /><output>{exportProgress}%</output></div>}
            <div className="export-actions"><button onClick={exportBusy ? cancelExport : () => setExportDialogOpen(false)}>{exportBusy ? "処理を中止" : "キャンセル"}</button><button className="primary" onClick={() => exportNow()} disabled={exportBusy}>{exportBusy ? "処理中…" : "EXPORT"}</button></div>
          </section>
        </div>
      )}
      <p className="status" role="status" aria-live="polite">{notice}</p>
      <footer><span>INKLOOM / RISO-LIKE IMAGE LAB</span><span>YOUR IMAGE STAYS ON YOUR DEVICE</span></footer>
    </main>
  );
}

function PresetCard({ preset, saved = false, onApply, onDelete }: { preset: PresetState; saved?: boolean; onApply: (preset: PresetState) => void; onDelete?: (id: string) => void }) {
  const paper = paperById[preset.paperId] ?? paperById.warmWhite;
  const inks = preset.plates.map((plate) => inkById[plate.inkId] ?? inkById.black).slice(0, 3);
  return (
    <article className="preset-card">
      <button className="preset-art" onClick={() => onApply(preset)} style={{ "--preset-paper": paper.hex } as CSSProperties} aria-label={`${preset.name} を適用`}>
        <span className="preset-stripe" />
        {inks.map((ink, index) => <i key={`${ink.id}-${index}`} style={{ "--preset-ink": ink.hex, "--preset-index": index } as CSSProperties} />)}
        <small>{preset.settings.screening === "grain" ? "GRAIN" : preset.settings.angleMode.toUpperCase()}</small>
      </button>
      <div><button className="preset-name" onClick={() => onApply(preset)}>{preset.name}</button>{saved && onDelete && <button className="preset-delete" onClick={() => onDelete(preset.id)} aria-label={`${preset.name} を削除`}>×</button>}</div>
      <p>{paper.name} · {preset.plates.length} INKS</p>
    </article>
  );
}
