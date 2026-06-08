/** Common aspect ratios for outpaint */
export const OUTPAINT_ASPECT_RATIOS = [
  { label: "1:1 (Square)", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
  { label: "16:9 (Landscape)", value: "16:9" },
  { label: "9:16 (Portrait)", value: "9:16" },
  { label: "3:2", value: "3:2" },
  { label: "2:3", value: "2:3" },
  { label: "21:9 (Ultrawide)", value: "21:9" },
  { label: "9:21", value: "9:21" },
] as const;

export type OutpaintAspectRatio = (typeof OUTPAINT_ASPECT_RATIOS)[number]["value"] | null;

/** Calculate expansion values to achieve a target aspect ratio, centering the original image */
export function calculateExpansionForAspectRatio(
  imageWidth: number,
  imageHeight: number,
  targetAspectRatio: string
): { left: number; right: number; top: number; bottom: number } | null {
  const parts = targetAspectRatio.split(":");
  if (parts.length !== 2) return null;
  const targetW = Number(parts[0]);
  const targetH = Number(parts[1]);
  if (!Number.isFinite(targetW) || !Number.isFinite(targetH) || targetW <= 0 || targetH <= 0) return null;

  const targetRatio = targetW / targetH;
  const currentRatio = imageWidth / imageHeight;

  let newWidth = imageWidth;
  let newHeight = imageHeight;

  if (Math.abs(currentRatio - targetRatio) < 0.001) {
    // Already at target ratio
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }

  if (currentRatio < targetRatio) {
    // Need to expand width (add left/right)
    newWidth = Math.round(imageHeight * targetRatio);
  } else {
    // Need to expand height (add top/bottom)
    newHeight = Math.round(imageWidth / targetRatio);
  }

  // Calculate expansion and snap to 64px grid
  const totalExpandX = newWidth - imageWidth;
  const totalExpandY = newHeight - imageHeight;

  // Split evenly, snapped to 64
  const snapTo64 = (n: number) => Math.round(n / 64) * 64;
  const halfExpandX = snapTo64(totalExpandX / 2);
  const halfExpandY = snapTo64(totalExpandY / 2);

  return {
    left: Math.max(0, halfExpandX),
    right: Math.max(0, halfExpandX),
    top: Math.max(0, halfExpandY),
    bottom: Math.max(0, halfExpandY),
  };
}
