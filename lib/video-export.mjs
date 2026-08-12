/**
 * Video codecs are happiest with even dimensions. Keep the requested aspect
 * ratio while clamping the long edge to the deliberately modest browser
 * export presets used by IROSTRATA.
 */
export function calculateVideoSize(ratio, longEdge) {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
  const edge = Math.max(2, Math.round(longEdge / 2) * 2);
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  return safeRatio >= 1
    ? { width: edge, height: even(edge / safeRatio) }
    : { width: even(edge * safeRatio), height: edge };
}

export function calculateVideoFrameCount(duration, fps) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const safeFps = Math.max(1, Math.round(fps));
  return Math.max(1, Math.ceil(duration * safeFps));
}

export function formatVideoTime(seconds) {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
