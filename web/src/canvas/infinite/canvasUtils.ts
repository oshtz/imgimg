export const GRID_SPACING = 40;
export const DOT_RADIUS = 1.5;
export const DOT_COLOR = "#e4e4e7"; // zinc-200
export const DOT_COLOR_DARK = "#2d2d33"; // zinc-800 muted

/** Ray-casting point-in-polygon test */
export function pointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
