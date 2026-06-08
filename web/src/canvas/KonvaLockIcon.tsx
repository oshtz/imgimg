import { Group, Path } from "react-konva";

/**
 * Konva-compatible lock icon using the Tabler Icons TbLock SVG path data.
 * Renders as stroked paths (matching the Tabler icon style) inside a 24×24 coordinate space,
 * scaled down to the desired `size`.
 */

// TbLock SVG paths (24×24 viewBox)
const LOCK_BODY = "M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z";
const LOCK_KEYHOLE = "M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0";
const LOCK_SHACKLE = "M8 11v-4a4 4 0 1 1 8 0v4";

type Props = {
  x: number;
  y: number;
  /** Rendered size in canvas pixels (default 14) */
  size?: number;
  /** Stroke colour (default "#a1a1aa" — zinc-400) */
  stroke?: string;
};

export function KonvaLockIcon({ x, y, size = 14, stroke = "#a1a1aa" }: Props) {
  const scale = size / 24;
  return (
    <Group x={x} y={y} scaleX={scale} scaleY={scale} listening={false}>
      <Path data={LOCK_BODY} stroke={stroke} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
      <Path data={LOCK_KEYHOLE} stroke={stroke} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
      <Path data={LOCK_SHACKLE} stroke={stroke} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
    </Group>
  );
}
