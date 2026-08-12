"use client";

import { ChangeEvent, CSSProperties, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { renderPipeline, renderStageImage, type RenderStage } from "./engine";
import { calculateWorkSize } from "../lib/render-size.mjs";
import { normalizePresetState } from "../lib/preset-state.mjs";
import { createRandomRecipe } from "../lib/random-recipe";
import { createZip, setJpegDpi, setPngDpi } from "./export-utils";
import { htmlLang, initialLocale, localeOptions, localeStorageKey, translate, type Locale, type MessageKey } from "./i18n";

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
  grainSizeMM: number;
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

type NoticeState = { key: MessageKey; variables?: Record<string, string | number> };

const presetStorageKey = "irostrata.saved-presets.v1";
const legacyPresetStorageKey = "inkloom.saved-presets.v1";

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

const angleDescriptionKeys: Record<AngleMode, MessageKey> = {
  dot: "tone.angle.dot",
  offset: "tone.angle.offset",
  rosette: "tone.angle.rosette",
};

const builtInPresetIds = new Set(builtInPresets.map((preset) => preset.id));

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
  const originalPreviewRef = useRef<ImageData | null>(null);
  const processedPreviewRef = useRef<ImageData | null>(null);
  const originalHeldRef = useRef(false);
  const previewPipelineCacheRef = useRef<{ separationKey: string; screenKey: string; printKey: string; registrationKey: string; result: ReturnType<typeof renderPipeline> } | null>(null);
  const localeMountedRef = useRef(false);
  const nextPlateIdRef = useRef(3);
  const [plates, setPlates] = useState<InkPlate[]>(initialPlates);
  const [activePlateId, setActivePlateId] = useState(1);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [locale, setLocale] = useState<Locale>("en");
  const [imageState, setImageState] = useState<{ name: string; ready: boolean; revision: number }>({ name: "", ready: true, revision: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState<NoticeState>({ key: "notice.ready" });
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
  const [isOriginalHeld, setIsOriginalHeld] = useState(false);
  const activePaper = paperById[paperId];
  const t = useCallback((key: MessageKey, variables: Record<string, string | number> = {}) => translate(locale, key, variables), [locale]);
  const inkName = useCallback((inkId: InkId) => t(`ink.${inkId}` as MessageKey), [t]);
  const paperName = useCallback((nextPaperId: PaperId) => t(`paper.${nextPaperId}` as MessageKey), [t]);
  const presetDisplayName = useCallback((preset: PresetState) => builtInPresetIds.has(preset.id) ? t(`builtIn.${preset.id}` as MessageKey) : preset.name, [t]);
  const notify = useCallback((key: MessageKey, variables?: Record<string, string | number>) => setNotice({ key, variables }), []);

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
    const processedPreview = renderStageImage(result, sourceImage, enginePlates, {
      ...settings,
      paper: activePaper.rgb.map((channel) => channel / 255) as [number, number, number],
    }, previewStage, previewPlateIndex);
    originalPreviewRef.current = sourceImage;
    processedPreviewRef.current = processedPreview;
    ctx.putImageData(originalHeldRef.current ? sourceImage : processedPreview, 0, 0);
  }, [activePaper, frameFit, frameRatio, imageState.revision, paperId, plates, previewPlateIndex, previewStage, settings]);

  useEffect(() => {
    drawArtwork();
  }, [drawArtwork, imageState.revision]);

  useEffect(() => {
    if (!localeMountedRef.current) {
      localeMountedRef.current = true;
      const next = initialLocale(window.localStorage.getItem(localeStorageKey), window.navigator.language);
      if (next !== locale) {
        queueMicrotask(() => setLocale(next));
        return;
      }
    }
    window.localStorage.setItem(localeStorageKey, locale);
    document.documentElement.lang = htmlLang(locale);
    document.documentElement.dataset.locale = locale;
    document.title = t("meta.title");
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  }, [locale, t]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    exportWorkerRef.current?.terminate();
  }, []);

  useEffect(() => {
    try {
      const currentStored = window.localStorage.getItem(presetStorageKey);
      const legacyStored = window.localStorage.getItem(legacyPresetStorageKey);
      const stored = currentStored ?? legacyStored;
      if (!stored) return;
      const parsed = JSON.parse(stored) as PresetState[];
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((preset) => preset?.name && paperById[preset.paperId] && Array.isArray(preset.plates));
        if (!currentStored && legacyStored) {
          window.localStorage.setItem(presetStorageKey, JSON.stringify(valid));
          window.localStorage.removeItem(legacyPresetStorageKey);
        }
        const timer = window.setTimeout(() => setSavedPresets(valid), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // A malformed local preset must never prevent the editor from opening.
      window.localStorage.removeItem(presetStorageKey);
      window.localStorage.removeItem(legacyPresetStorageKey);
    }
  }, []);

  const loadFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("notice.invalidFile");
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
      notify("notice.loaded");
    };
    image.onerror = () => notify("notice.loadFailed");
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

  const setOriginalPreview = (active: boolean) => {
    originalHeldRef.current = active;
    setIsOriginalHeld(active);
    const canvas = canvasRef.current;
    const frame = active ? originalPreviewRef.current : processedPreviewRef.current;
    const context = canvas?.getContext("2d");
    if (frame && context) context.putImageData(frame, 0, 0);
  };

  const setScreening = (screening: ScreeningMode) => {
    setSettings((current) => ({ ...current, screening }));
    notify(screening === "screen" ? "notice.screen" : "notice.grain");
  };

  const setAngleMode = (angleMode: AngleMode) => {
    setSettings((current) => ({ ...current, angleMode }));
    notify("notice.angle", { name: angleLabels[angleMode], description: t(angleDescriptionKeys[angleMode]) });
  };

  const toggleCustomMode = () => {
    const next = !settings.customMode;
    setSettings((current) => ({ ...current, customMode: next }));
    notify(next ? "notice.customOn" : "notice.customOff");
  };

  const toggleCustomLock = () => {
    const next = !settings.customLocked;
    setSettings((current) => ({ ...current, customLocked: next }));
    notify(next ? "notice.lockOn" : "notice.lockOff");
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
    notify("notice.paper", { name: paperName(nextPaperId) });
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
    notify("notice.presetApplied", { name: presetDisplayName(preset) });
  };

  const savePreset = () => {
    const name = presetName.trim() || t("preset.defaultName", { index: savedPresets.length + 1 });
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
    window.localStorage.setItem(presetStorageKey, JSON.stringify(next));
    notify("notice.presetSaved", { name });
  };

  const deleteSavedPreset = (presetId: string) => {
    const next = savedPresets.filter((preset) => preset.id !== presetId);
    setSavedPresets(next);
    window.localStorage.setItem(presetStorageKey, JSON.stringify(next));
  };

  const selectInk = (inkId: InkId) => {
    setPlates((current) => current.map((plate) => plate.id === activePlateId ? { ...plate, inkId } : plate));
    notify("notice.inkChanged", { name: inkName(inkId) });
  };

  const addPlate = () => {
    if (plates.length >= 6) {
      notify("notice.maxInks");
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
    notify("notice.inkAdded", { name: inkName(nextInk.id) });
  };

  const removePlate = (plateId: number) => {
    if (plates.length === 1) {
      notify("notice.minInks");
      return;
    }
    const plateIndex = plates.findIndex((plate) => plate.id === plateId);
    const nextActive = plates[plateIndex - 1] ?? plates[plateIndex + 1];
    setPlates((current) => current.filter((plate) => plate.id !== plateId));
    if (activePlateId === plateId && nextActive) setActivePlateId(nextActive.id);
    notify("notice.inkRemoved");
  };

  const autoSelectInks = () => {
    const image = imageRef.current;
    if (!image) {
      const sampleOrder: InkId[] = ["fluorescentPink", "blue", "yellow", "green", "orange", "black"];
      setPlates((current) => current.map((plate, index) => ({ ...plate, inkId: sampleOrder[index] })));
      notify("notice.autoSample");
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
    notify("notice.autoImage");
  };

  const randomizeAll = () => {
    const recipe = createRandomRecipe(
      inkPalette.map((ink) => ink.id),
      paperProfiles.map((paper) => paper.id),
    );
    const randomizedPlates = recipe.plateInkIds.map((inkId, index) => ({ id: index + 1, inkId }));
    const customByPlate = Object.fromEntries(randomizedPlates.map((plate, index) => [plate.id, recipe.customScreens[index]]));
    setPlates(randomizedPlates);
    setActivePlateId(randomizedPlates[0].id);
    nextPlateIdRef.current = randomizedPlates.length + 1;
    setSettings({
      screening: recipe.screening,
      angleMode: recipe.angleMode,
      customMode: recipe.customMode,
      customLocked: false,
      customByPlate,
      freq: recipe.freq,
      grainSizeMM: recipe.grainSizeMM,
      brightness: recipe.brightness,
      contrast: recipe.contrast,
      ink: recipe.ink,
      paperTexture: recipe.paperTexture,
      shift: recipe.shift,
      showPaper: true,
    });
    setPaperId(recipe.paperId);
    setPaperPickerOpen(false);
    setPreviewStage("composite");
    setPreviewPlateIndex(0);
    notify("notice.random", { count: randomizedPlates.length, paper: paperName(recipe.paperId), mode: recipe.screening.toUpperCase() });
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
    notify("notice.reset");
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
    notify("notice.exporting");
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
        files["README.txt"] = new TextEncoder().encode(`IROSTRATA separations\nStage: ${separationStage}\nSize: ${dimensions.width} x ${dimensions.height}px\nResolution: 300 DPI\n`);
        downloadBlob(new Blob([createZip(files) as BlobPart], { type: "application/zip" }), `irostrata-${separationStage}-${dimensions.width}x${dimensions.height}.zip`);
        notify("notice.separationsDone", { count: plates.length, stage: separationStage });
      } else {
        const output = outputs.composite;
        const bytes = await canvasBytes(output.data, dimensions.width, dimensions.height, output.channels, exportFormat);
        downloadBlob(new Blob([bytes as BlobPart], { type: exportFormat === "jpeg" ? "image/jpeg" : "image/png" }), `irostrata-${printPreset}-${dimensions.width}x${dimensions.height}.${exportFormat}`);
        notify("notice.imageDone", { width: dimensions.width, height: dimensions.height });
      }
      setExportDialogOpen(false);
    } catch (error) {
      notify(error instanceof DOMException && error.name === "AbortError" ? "notice.exportCancelled" : "notice.exportFailed");
    } finally {
      exportWorkerRef.current?.terminate();
      exportWorkerRef.current = null;
      setExportBusy(false);
      setExportProgress(0);
    }
  };

  const cancelExport = () => {
    exportWorkerRef.current?.postMessage({ type: "cancel" });
    notify("notice.exportStopping");
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
          <a className="brand" href="#studio" aria-label={t("nav.home")}><span className="brand-mark">◎</span><span>IROSTRATA</span></a>
          <nav className="mode-tabs" aria-label={t("nav.mode")}><button className="active">{t("nav.image")}</button><button onClick={() => setPresetGalleryOpen(true)}>{t("nav.preset")}</button></nav>
        </div>
        <p>{t("nav.lab")}</p>
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label={t("language.label")}>
            {localeOptions.map((option) => <button key={option.id} className={locale === option.id ? "selected" : ""} onClick={() => { setLocale(option.id); setNotice({ key: "notice.ready" }); }} aria-pressed={locale === option.id} title={option.label} lang={option.htmlLang}>{option.short}</button>)}
          </div>
          <div className="export-wrap">
            <button className="download top-download" onClick={() => setExportMenuOpen((open) => !open)} aria-expanded={exportMenuOpen}>{t("action.export")} <span aria-hidden="true">↗</span></button>
            {exportMenuOpen && (
              <div className="export-menu" role="menu">
                <button onClick={() => quickExport(1)}>{t("export.quick1")}</button>
                <button onClick={() => quickExport(2)}>{t("export.quick2")}</button>
                <button onClick={() => quickExport(3)}>{t("export.quick3")}</button>
                <div className="menu-divider" />
                <button onClick={() => { setExportMenuOpen(false); setExportDialogOpen(true); }}>{t("export.detailed")}</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="studio" id="studio">
        <aside className="control-panel" aria-label={t("nav.lab")}>
          <div className="panel-heading">
            <p className="eyebrow">{t("source.eyebrow")}</p>
            <h1>{t("source.headingA")} <em>{t("source.headingB")}</em></h1>
            <p className="intro">{t("source.intro")}</p>
          </div>

          <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={onFileChange} />
          <button
            className={`upload-zone ${isDragging ? "is-dragging" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            aria-label={t("source.aria")}
          >
            <span className="upload-icon" aria-hidden="true">↑</span>
            <span><strong>{t("source.addPhoto")}</strong><small>{t("source.drop")}</small></span>
            <span className="file-type">JPG · PNG · WEBP</span>
          </button>
          <p className="source-name"><span>●</span> {imageState.name || t("source.sample")}</p>

          <div className="ink-editor">
            <div className="section-label"><span>{t("ink.layers")}</span><small>{t("ink.colors", { count: plates.length })}</small></div>
            <div className="ink-tabs" role="tablist" aria-label={t("ink.tabsAria")}>
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
                      <span>{inkName(ink.id)}</span>
                      <small>{settings.screening === "grain" ? "GRAIN" : `${getScreenAngle(settings.angleMode, plateIndex)}°`}</small>
                    </button>
                    <button className="ink-tab-remove" onClick={() => removePlate(plate.id)} aria-label={t("ink.remove", { name: inkName(ink.id) })}>×</button>
                  </div>
                );
              })}
              <button className="add-ink" onClick={addPlate} disabled={plates.length >= 6} aria-label={t("ink.add")}>＋ <span>INK</span></button>
            </div>
            <div className="ink-palette" id="ink-palette" role="tabpanel" aria-label={t("ink.change", { name: inkName(activePlate.inkId) })}>
              <button className="auto-ink" onClick={autoSelectInks} title={t("ink.autoTitle")}>
                <span>A</span><small>AUTO</small>
              </button>
              {inkPalette.map((ink) => (
                <button
                  key={ink.id}
                  className={`ink-swatch ${activePlate.inkId === ink.id ? "selected" : ""}`}
                  style={{ "--swatch-color": ink.hex } as CSSProperties}
                  onClick={() => selectInk(ink.id)}
                  aria-label={inkName(ink.id)}
                  aria-pressed={activePlate.inkId === ink.id}
                  title={inkName(ink.id)}
                ><span aria-hidden="true" /></button>
              ))}
            </div>
            <p className="palette-help"><b>AUTO</b> {t("ink.autoHelp")}</p>
          </div>

          <button className="randomize-all" onClick={randomizeAll}>
            <span><i aria-hidden="true">✣</i> {t("random.title")}</span><small>{t("random.detail")}</small>
          </button>

          <div className="control-section tone-controls">
            <div className="section-label"><span>TONE</span><small>{settings.customMode ? "CUSTOM SCREEN" : settings.screening === "screen" ? "SCREENING" : "POINTILLISM"}</small></div>
            <div className="tone-mode-row" role="group" aria-label={t("tone.groupAria")}>
              <button className={`tone-mode ${settings.screening === "screen" ? "selected" : ""}`} onClick={() => setScreening("screen")} aria-pressed={settings.screening === "screen"}>▦ SCREEN</button>
              <button className={`tone-mode ${settings.screening === "grain" ? "selected" : ""}`} onClick={() => setScreening("grain")} aria-pressed={settings.screening === "grain"}>⠿ GRAIN</button>
              <div className="paper-picker">
                <button className={`tone-mode paper-mode ${settings.showPaper ? "selected" : ""}`} onClick={() => setPaperPickerOpen((open) => !open)} aria-expanded={paperPickerOpen}>▣ {t("tone.paper")}</button>
                {paperPickerOpen && (
                  <div className="paper-menu" role="menu" aria-label={t("tone.paperMenu")}>
                    <p>{t("tone.paperMenu")}</p>
                    <button className={!settings.showPaper ? "selected" : ""} onClick={() => { setSettings((current) => ({ ...current, showPaper: false })); setPaperPickerOpen(false); }} role="menuitem">
                      <i style={{ background: "#fff" }} aria-hidden="true" /><span>{t("tone.paperOff")}</span><small>{t("tone.whiteBase")}</small>
                    </button>
                    {paperProfiles.map((paper) => (
                      <button key={paper.id} className={paperId === paper.id ? "selected" : ""} onClick={() => selectPaper(paper.id)} role="menuitem">
                        <i style={{ background: paper.hex }} aria-hidden="true" />
                        <span>{paperName(paper.id)}</span>
                        <small>{Math.round(paper.grainAmount * 100)}% GRAIN</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="paper-profile-summary"><b>{paperName(activePaper.id)}</b> · {activePaper.hex} · {t("tone.paperSummary", { grain: activePaper.grainAmount * 100, fiber: activePaper.fiberAmount * 100 })}</p>

            <div className="custom-mode-bar">
              <button className={`custom-mode-toggle ${settings.customMode ? "selected" : ""}`} onClick={toggleCustomMode} aria-pressed={settings.customMode}>
                <span>▦ {t("tone.custom")}</span><small>{settings.customMode ? "ON" : "OFF"}</small>
              </button>
              {settings.customMode && (
                <button className="custom-lock" onClick={toggleCustomLock} aria-pressed={settings.customLocked} title={settings.customLocked ? t("tone.lockAll") : t("tone.lockOne")}>
                  {settings.customLocked ? "▣" : "▱"}
                </button>
              )}
            </div>

            {settings.customMode ? (
              <div className="custom-grid" aria-label={t("tone.customAria")}>
                {settings.screening === "screen" && <label className="custom-control custom-control-wide"><span>FREQ <output>{activeCustom.freq} lpi</output></span><input type="range" min="24" max="90" value={activeCustom.freq} onChange={(event) => updateCustomSetting("freq", Number(event.target.value))} /><small>{t("tone.freqCustomHelp")}</small></label>}
                {settings.screening === "screen" && <label className="custom-control"><span>ANGLE <output>{activeCustom.angle}°</output></span><input type="range" min="0" max="90" value={activeCustom.angle} onChange={(event) => updateCustomSetting("angle", Number(event.target.value))} /><small>{t("tone.angleHelp")}</small></label>}
                <label className="custom-control"><span>DENSITY <output>{activeCustom.density.toFixed(2)}</output></span><input type="range" min="0.2" max="1.4" step="0.01" value={activeCustom.density} onChange={(event) => updateCustomSetting("density", Number(event.target.value))} /><small>{t("tone.densityHelp")}</small></label>
                <label className="custom-control"><span>OPACITY <output>{activeCustom.opacity.toFixed(2)}</output></span><input type="range" min="0.2" max="1" step="0.01" value={activeCustom.opacity} onChange={(event) => updateCustomSetting("opacity", Number(event.target.value))} /><small>{t("tone.opacityHelp")}</small></label>
                <label className="custom-control"><span>DOT GAIN <output>{activeCustom.dotGain.toFixed(2)}</output></span><input type="range" min="0" max="0.45" step="0.01" value={activeCustom.dotGain} onChange={(event) => updateCustomSetting("dotGain", Number(event.target.value))} /><small>{t("tone.dotGainHelp")}</small></label>
                <label className="custom-control"><span>EDGE GRAIN <output>{activeCustom.edgeGrain.toFixed(2)}</output></span><input type="range" min="0" max="0.5" step="0.01" value={activeCustom.edgeGrain} onChange={(event) => updateCustomSetting("edgeGrain", Number(event.target.value))} /><small>{t("tone.edgeGrainHelp")}</small></label>
                <label className="custom-control"><span>DENSITY VAR <output>{activeCustom.densityVar.toFixed(2)}</output></span><input type="range" min="0" max="0.4" step="0.01" value={activeCustom.densityVar} onChange={(event) => updateCustomSetting("densityVar", Number(event.target.value))} /><small>{t("tone.densityVarHelp")}</small></label>
                <label className="custom-control"><span>WARP <output>{activeCustom.warp.toFixed(3)} mm</output></span><input type="range" min="0" max="0.3" step="0.001" value={activeCustom.warp} onChange={(event) => updateCustomSetting("warp", Number(event.target.value))} /><small>{t("tone.warpHelp")}</small></label>
                <label className="custom-control"><span>OFFSET X <output>{activeCustom.offsetX.toFixed(2)} mm</output></span><input type="range" min="-0.5" max="0.5" step="0.01" value={activeCustom.offsetX} onChange={(event) => updateCustomSetting("offsetX", Number(event.target.value))} /><small>{t("tone.offsetXHelp")}</small></label>
                <label className="custom-control"><span>OFFSET Y <output>{activeCustom.offsetY.toFixed(2)} mm</output></span><input type="range" min="-0.5" max="0.5" step="0.01" value={activeCustom.offsetY} onChange={(event) => updateCustomSetting("offsetY", Number(event.target.value))} /><small>{t("tone.offsetYHelp")}</small></label>
                <label className="custom-control"><span>ROTATION <output>{activeCustom.rotation.toFixed(3)}°</output></span><input type="range" min="-1" max="1" step="0.001" value={activeCustom.rotation} onChange={(event) => updateCustomSetting("rotation", Number(event.target.value))} /><small>{t("tone.rotationHelp")}</small></label>
              </div>
            ) : (
            <div className="tone-grid">
              <label className={`tone-control ${settings.screening === "grain" ? "is-disabled" : ""}`}>
                <span>FREQ <output>{settings.freq} lpi</output></span>
                <input type="range" min="24" max="90" value={settings.freq} disabled={settings.screening === "grain"} onChange={(event) => updateSetting("freq", Number(event.target.value))} />
                <small>{t("tone.freqHelp")}</small>
              </label>
              {settings.screening === "grain" && <label className="tone-control"><span>GRAIN SIZE <output>{settings.grainSizeMM.toFixed(2)} mm</output></span><input type="range" min="0.15" max="1.2" step="0.01" value={settings.grainSizeMM} onChange={(event) => updateSetting("grainSizeMM", Number(event.target.value))} /><small>{t("tone.grainSizeHelp")}</small></label>}
              <label className={`tone-control ${settings.screening === "grain" ? "is-disabled" : ""}`}>
                <span>ANGLE <output>{angleLabels[settings.angleMode]}</output></span>
                <select value={settings.angleMode} disabled={settings.screening === "grain"} onChange={(event) => setAngleMode(event.target.value as AngleMode)} aria-label={t("tone.angleAria")}>
                  <option value="dot">Dot on Dot</option>
                  <option value="offset">Offset</option>
                  <option value="rosette">Rosette</option>
                </select>
                <small>{t(angleDescriptionKeys[settings.angleMode])}</small>
              </label>
              <label className="tone-control">
                <span>BRIGHTNESS <output>{formatSigned(settings.brightness)}</output></span>
                <input type="range" min="-20" max="20" value={settings.brightness} onChange={(event) => updateSetting("brightness", Number(event.target.value))} />
                <small>{t("tone.brightnessHelp")}</small>
              </label>
              <label className="tone-control">
                <span>CONTRAST <output>{formatSigned(settings.contrast)}</output></span>
                <input type="range" min="-20" max="20" value={settings.contrast} onChange={(event) => updateSetting("contrast", Number(event.target.value))} />
                <small>{t("tone.contrastHelp")}</small>
              </label>
            </div>
            )}
            <p className="tone-help">{t(settings.customMode ? "tone.helpCustom" : settings.screening === "screen" ? "tone.helpScreen" : "tone.helpGrain")}</p>
          </div>

          <div className="control-section sliders">
            <div className="section-label"><span>{t("press.heading")}</span><small>{t("press.live")}</small></div>
            <label className="range-row">
              <span>{t("press.ink")}<output>{settings.ink}</output></span>
              <input type="range" min="45" max="100" value={settings.ink} onChange={(event) => updateSetting("ink", Number(event.target.value))} />
            </label>
            <label className="range-row">
              <span>{t("press.paper")}<output>{settings.paperTexture}%</output></span>
              <input type="range" min="0" max="150" value={settings.paperTexture} disabled={!settings.showPaper} onChange={(event) => updateSetting("paperTexture", Number(event.target.value))} />
            </label>
            <label className="range-row">
              <span>{t("press.shift")}<output>{settings.shift}</output></span>
              <input type="range" min="0" max="12" value={settings.shift} onChange={(event) => updateSetting("shift", Number(event.target.value))} />
            </label>
          </div>

          <div className="control-section frame-controls">
            <div className="section-label"><span>{t("frame.heading")}</span><small>{t("frame.subheading")}</small></div>
            <div className="frame-ratios" role="group" aria-label={t("frame.ratioAria")}>
              {(["original", "1:1", "4:5", "3:4", "2:3", "9:16", "sqrt2"] as FrameRatio[]).map((ratio) => (
                <button key={ratio} className={frameRatio === ratio ? "selected" : ""} onClick={() => setFrameRatio(ratio)} aria-pressed={frameRatio === ratio}>{ratio === "original" ? t("frame.original") : ratio === "sqrt2" ? "√2" : ratio}</button>
              ))}
            </div>
            <div className="frame-fit" role="group" aria-label={t("frame.fitAria")}>
              <button className={frameFit === "cover" ? "selected" : ""} onClick={() => setFrameFit("cover")} aria-pressed={frameFit === "cover"}>{t("frame.crop")}</button>
              <button className={frameFit === "contain" ? "selected" : ""} onClick={() => setFrameFit("contain")} aria-pressed={frameFit === "contain"}>{t("frame.fit")}</button>
            </div>
            <p className="frame-help">{t("frame.help")}</p>
          </div>

          <div className="panel-actions">
            <button className="reset" onClick={reset}>{t("action.reset")}</button>
            <button className="download mobile-download" onClick={() => { setExportMode("image"); setExportDialogOpen(true); }}>{t("action.export")} <span aria-hidden="true">↗</span></button>
          </div>
        </aside>

        <section className="preview-panel" aria-label={t("preview.aria")}>
          <div className="print-meta"><span>{t("preview.proof", { ratio: frameRatio === "original" ? t("frame.original") : frameRatio === "sqrt2" ? "√2" : frameRatio, count: String(plates.length).padStart(2, "0") })}</span><span>{plates.map((plate) => inkName(plate.inkId)).join(" + ")}</span></div>
          <div className="stage-inspector">
            <select value={previewStage} onChange={(event) => setPreviewStage(event.target.value as RenderStage)} aria-label={t("preview.stageAria")}>
              <option value="original">ORIGINAL</option><option value="tone">TONE</option><option value="gamut">GAMUT</option><option value="coverage">COVERAGE</option><option value="master">MASTER</option><option value="printed">PRINTED</option><option value="registered">REGISTERED</option><option value="composite">COMPOSITE</option>
            </select>
            {(["coverage", "master", "printed", "registered"] as RenderStage[]).includes(previewStage) && <select value={previewPlateIndex} onChange={(event) => setPreviewPlateIndex(Number(event.target.value))} aria-label={t("preview.plateAria")}>{plates.map((plate, index) => <option key={plate.id} value={index}>{t("preview.plate", { index: index + 1, name: inkName(plate.inkId) })}</option>)}</select>}
          </div>
          <div className={`paper-stage ${previewZoom === "fit" ? "is-fit" : "is-zoomed"}`}>
            <button
              className={`original-compare ${isOriginalHeld ? "is-held" : ""}`}
              aria-label={t("preview.compareAria")}
              aria-pressed={isOriginalHeld}
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setOriginalPreview(true); }}
              onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setOriginalPreview(false); }}
              onPointerCancel={() => setOriginalPreview(false)}
              onLostPointerCapture={() => setOriginalPreview(false)}
              onKeyDown={(event) => { if (!event.repeat && (event.key === " " || event.key === "Enter")) { event.preventDefault(); setOriginalPreview(true); } }}
              onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setOriginalPreview(false); } }}
              onBlur={() => setOriginalPreview(false)}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span>{isOriginalHeld ? t("preview.original") : t("preview.compare")}</span><small>{t("preview.hold")}</small>
            </button>
            <div className="preview-zoom" role="group" aria-label={t("preview.zoomAria")}>
              <button className={previewZoom === "fit" ? "selected" : ""} onClick={() => setPreviewZoom("fit")} aria-pressed={previewZoom === "fit"}>{t("frame.fit")}</button>
              <button className={previewZoom === 1 ? "selected" : ""} onClick={() => setPreviewZoom(1)} aria-pressed={previewZoom === 1}>100%</button>
              <button className={previewZoom === 2 ? "selected" : ""} onClick={() => setPreviewZoom(2)} aria-pressed={previewZoom === 2}>200%</button>
              <button className={previewZoom === 3 ? "selected" : ""} onClick={() => setPreviewZoom(3)} aria-pressed={previewZoom === 3}>300%</button>
            </div>
            <canvas
              ref={canvasRef}
              aria-label={t("preview.canvasAria")}
              style={previewZoom === "fit" ? undefined : { width: `${previewCanvasSize.width * previewZoom}px`, height: `${previewCanvasSize.height * previewZoom}px` }}
            />
          </div>
          <div className="proof-footer">
            <p><b>{t("preview.tipLabel")}</b> {t("preview.tip")}</p>
            <span>{imageState.ready ? t("preview.processing") : t("preview.loading")}</span>
          </div>
        </section>
      </section>
      {presetGalleryOpen && (
        <div className="preset-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPresetGalleryOpen(false); }}>
          <section className="preset-gallery" role="dialog" aria-modal="true" aria-labelledby="preset-title">
            <header className="preset-header">
              <div><p>{t("preset.library")}</p><h2 id="preset-title">{t("preset.headingA")} <em>{t("preset.headingB")}</em></h2></div>
              <button onClick={() => setPresetGalleryOpen(false)}>{t("action.close")}</button>
            </header>
            <div className="preset-save">
              <div><b>{t("preset.saveCurrent")}</b><span>{t("preset.saveHelp")}</span></div>
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={t("preset.defaultName", { index: savedPresets.length + 1 })} maxLength={36} aria-label={t("preset.nameAria")} />
              <button onClick={savePreset}>{t("action.savePreset")}</button>
            </div>
            {savedPresets.length > 0 && (
              <section className="preset-section" aria-labelledby="saved-presets-title">
                <h3 id="saved-presets-title">{t("preset.saved")}</h3>
                <div className="preset-grid">
                  {savedPresets.map((preset) => <PresetCard key={preset.id} preset={preset} displayName={presetDisplayName(preset)} saved onApply={applyPreset} onDelete={deleteSavedPreset} t={t} paperName={paperName} />)}
                </div>
              </section>
            )}
            <section className="preset-section" aria-labelledby="built-in-presets-title">
              <h3 id="built-in-presets-title">{t("preset.starting")}</h3>
              <div className="preset-grid">
                {builtInPresets.map((preset) => <PresetCard key={preset.id} preset={preset} displayName={presetDisplayName(preset)} onApply={applyPreset} t={t} paperName={paperName} />)}
              </div>
            </section>
          </section>
        </div>
      )}
      {exportDialogOpen && (
        <div className="export-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportDialogOpen(false); }}>
          <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
            <h2 id="export-title">{t("export.heading")}</h2>
            <p>{t("export.intro")}</p>
            <div className="export-options">
              <label>{t("export.mode")}<select value={exportMode} onChange={(event) => setExportMode(event.target.value as ExportMode)}><option value="image">{t("export.modeImage")}</option><option value="print">{t("export.modePrint")}</option><option value="separations">{t("export.modeSeparations")}</option></select></label>
              {exportMode === "image" && <label>{t("export.scale")}<select value={exportScale} onChange={(event) => setExportScale(Number(event.target.value) as 1 | 2 | 3)}><option value="1">{t("export.quick1")}</option><option value="2">{t("export.quick2")}</option><option value="3">{t("export.quick3")}</option></select></label>}
              {exportMode !== "image" && <label>{t("export.size")}<select value={printPreset} onChange={(event) => setPrintPreset(event.target.value as "A6" | "A5" | "A4")}><option value="A6">A6 / 105 × 148 mm</option><option value="A5">A5 / 148 × 210 mm</option><option value="A4">A4 / 210 × 297 mm</option></select></label>}
              {exportMode !== "separations" && <label>{t("export.format")}<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}><option value="png">PNG</option><option value="jpeg">JPG</option></select></label>}
              {exportMode === "separations" && <label>{t("export.plateData")}<select value={separationStage} onChange={(event) => setSeparationStage(event.target.value as SeparationStage)}><option value="coverage">{t("export.continuous")}</option><option value="master">{t("export.master")}</option><option value="registered">{t("export.registered")}</option></select></label>}
            </div>
            {exportBusy && <div className="export-progress"><span style={{ width: `${exportProgress}%` }} /><output>{exportProgress}%</output></div>}
            <div className="export-actions"><button onClick={exportBusy ? cancelExport : () => setExportDialogOpen(false)}>{exportBusy ? t("action.stop") : t("action.cancel")}</button><button className="primary" onClick={() => exportNow()} disabled={exportBusy}>{exportBusy ? t("action.processing") : t("action.export")}</button></div>
          </section>
        </div>
      )}
      <p className="status" role="status" aria-live="polite">{t(notice.key, notice.variables)}</p>
      <footer><span>{t("footer.lab")}</span><span>{t("footer.private")}</span></footer>
    </main>
  );
}

function PresetCard({ preset, displayName, saved = false, onApply, onDelete, t, paperName }: { preset: PresetState; displayName: string; saved?: boolean; onApply: (preset: PresetState) => void; onDelete?: (id: string) => void; t: (key: MessageKey, variables?: Record<string, string | number>) => string; paperName: (id: PaperId) => string }) {
  const paper = paperById[preset.paperId] ?? paperById.warmWhite;
  const inks = preset.plates.map((plate) => inkById[plate.inkId] ?? inkById.black).slice(0, 3);
  return (
    <article className="preset-card">
      <button className="preset-art" onClick={() => onApply(preset)} style={{ "--preset-paper": paper.hex } as CSSProperties} aria-label={t("preset.apply", { name: displayName })}>
        <span className="preset-stripe" />
        {inks.map((ink, index) => <i key={`${ink.id}-${index}`} style={{ "--preset-ink": ink.hex, "--preset-index": index } as CSSProperties} />)}
        <small>{preset.settings.screening === "grain" ? "GRAIN" : preset.settings.angleMode.toUpperCase()}</small>
      </button>
      <div><button className="preset-name" onClick={() => onApply(preset)}>{displayName}</button>{saved && onDelete && <button className="preset-delete" onClick={() => onDelete(preset.id)} aria-label={t("preset.delete", { name: displayName })}>×</button>}</div>
      <p>{paperName(paper.id)} · {t("preset.inks", { count: preset.plates.length })}</p>
    </article>
  );
}
