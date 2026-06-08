/**
 * Clamp a batch size value to one of the valid options (1, 2, 3, or 4).
 */
export function clampBatchSize(v: unknown): 1 | 2 | 3 | 4 {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 4;
}
