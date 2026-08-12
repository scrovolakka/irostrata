/**
 * Select a bounded working canvas without changing the requested frame ratio.
 * A maximum edge protects portrait panoramas while a pixel budget keeps normal
 * frames detailed enough to inspect their halftone pattern.
 */
export function calculateWorkSize(ratio, { maxPixels = 648000, maxEdge = 1200 } = {}) {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 4 / 3;
  const pixelBudget = Math.max(1, maxPixels);
  const edgeLimit = Math.max(1, maxEdge);
  const budgetWidth = Math.sqrt(pixelBudget * safeRatio);
  const budgetHeight = Math.sqrt(pixelBudget / safeRatio);
  const scale = Math.min(1, edgeLimit / Math.max(budgetWidth, budgetHeight));

  let width = Math.max(1, Math.round(budgetWidth * scale));
  let height = Math.max(1, Math.round(budgetHeight * scale));

  // Rounding can put one side just beyond the edge limit. Scaling both sides
  // preserves the frame rather than introducing a hidden min-height crop.
  if (Math.max(width, height) > edgeLimit) {
    const fit = edgeLimit / Math.max(width, height);
    width = Math.max(1, Math.floor(width * fit));
    height = Math.max(1, Math.floor(height * fit));
  }

  return { width, height, pixels: width * height };
}
