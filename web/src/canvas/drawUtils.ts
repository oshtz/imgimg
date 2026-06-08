/**
 * Drawing utilities: path simplification and smoothing.
 */

type Point = { x: number; y: number };

/**
 * Ramer-Douglas-Peucker line simplification.
 * Removes points that deviate less than `epsilon` from the line between endpoints.
 */
export function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line (first→last)
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    let dist: number;
    if (lenSq === 0) {
      // first and last are the same point
      const ex = points[i].x - first.x;
      const ey = points[i].y - first.y;
      dist = Math.sqrt(ex * ex + ey * ey);
    } else {
      const t = Math.max(0, Math.min(1, ((points[i].x - first.x) * dx + (points[i].y - first.y) * dy) / lenSq));
      const projX = first.x + t * dx;
      const projY = first.y + t * dy;
      const ex = points[i].x - projX;
      const ey = points[i].y - projY;
      dist = Math.sqrt(ex * ex + ey * ey);
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

/**
 * Convert an array of points to an SVG path string using Catmull-Rom → cubic Bezier conversion.
 * Produces smooth curves through all points.
 * `offsetX` / `offsetY` are subtracted from each point (to make path relative to bounding box).
 */
export function smoothPathToSVG(points: Point[], offsetX: number, offsetY: number): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M${(p.x - offsetX).toFixed(1)} ${(p.y - offsetY).toFixed(1)}`;
  }
  if (points.length === 2) {
    const [a, b] = points;
    return `M${(a.x - offsetX).toFixed(1)} ${(a.y - offsetY).toFixed(1)} L${(b.x - offsetX).toFixed(1)} ${(b.y - offsetY).toFixed(1)}`;
  }

  const n = points.length;
  const parts: string[] = [];
  const px = (i: number) => (points[i].x - offsetX).toFixed(1);
  const py = (i: number) => (points[i].y - offsetY).toFixed(1);

  parts.push(`M${px(0)} ${py(0)}`);

  for (let i = 0; i < n - 1; i++) {
    // Catmull-Rom neighbors (clamp at boundaries)
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];

    // Control points: cp1 = P1 + (P2 - P0) / 6,  cp2 = P2 - (P3 - P1) / 6
    const cp1x = (p1.x + (p2.x - p0.x) / 6 - offsetX).toFixed(1);
    const cp1y = (p1.y + (p2.y - p0.y) / 6 - offsetY).toFixed(1);
    const cp2x = (p2.x - (p3.x - p1.x) / 6 - offsetX).toFixed(1);
    const cp2y = (p2.y - (p3.y - p1.y) / 6 - offsetY).toFixed(1);

    parts.push(`C${cp1x} ${cp1y} ${cp2x} ${cp2y} ${px(i + 1)} ${py(i + 1)}`);
  }

  return parts.join(" ");
}
