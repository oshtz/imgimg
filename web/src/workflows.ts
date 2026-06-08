export type WorkflowId = string;

export const ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:4",
  "5:8",
  "9:16",
  "9:19",
  "9:21",
  "3:2",
  "4:3",
  "8:5",
  "16:9",
  "19:9",
  "21:9",
  "1:2",
  "2:1",
  "4:5",
  "5:4",
  "3:1",
  "1:3",
  "4:1",
  "1:4",
  "8:1",
  "1:8",
  "7:4",
  "4:7",
  "16:10",
  "10:16"
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && (ASPECT_RATIOS as readonly string[]).includes(v);
}

/** Find the closest predefined aspect ratio for the given pixel dimensions. */
export function nearestAspectRatio(width: number, height: number): AspectRatio {
  const target = width / height;
  let best: AspectRatio = "1:1";
  let bestDiff = Infinity;
  for (const ar of ASPECT_RATIOS) {
    const diff = Math.abs(aspectRatioToNumber(ar) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ar;
    }
  }
  return best;
}

export function aspectRatioToNumber(ar: AspectRatio) {
  const [wRaw, hRaw] = ar.split(":");
  const w = Number(wRaw);
  const h = Number(hRaw);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1;
  return w / h;
}

export function aspectRatioToSize(ar: AspectRatio) {
  const ratio = aspectRatioToNumber(ar);
  if (ratio === 1) return { width: 1024, height: 1024 };

  const multiple = 64;
  const base = 1104; // tuned to match existing 9:16/16:9 mapping closely

  function roundToMultiple(n: number) {
    return Math.max(multiple, Math.round(n / multiple) * multiple);
  }

  function clampSize(width: number, height: number) {
    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    return { width: roundToMultiple(width * scale), height: roundToMultiple(height * scale) };
  }

  const s = Math.sqrt(ratio);
  const rawWidth = base * s;
  const rawHeight = base / s;
  const width = roundToMultiple(rawWidth);
  const height = roundToMultiple(rawHeight);
  return clampSize(width, height);
}
