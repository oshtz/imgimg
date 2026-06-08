import { useRef, useEffect } from "react";
import { Group, Rect } from "react-konva";
import type Konva from "konva";

type Props = {
  width: number;
  height: number;
  cornerRadius?: number;
  /** Base fill colour */
  baseColor?: string;
  /** Shimmer highlight colour (should be translucent) */
  highlightColor?: string;
  /** Overall opacity of the shimmer rect (0–1) */
  opacity?: number;
};

/**
 * Konva-native dual-layer shimmer: a primary highlight band with a subtler
 * secondary band trailing behind it at a time offset, creating a richer effect.
 */
export function KonvaShimmerRect({
  width,
  height,
  cornerRadius = 4,
  baseColor = "#d4d4d8",
  highlightColor = "rgba(255,255,255,0.12)",
  opacity,
}: Props) {
  const primaryRef = useRef<Konva.Rect>(null);
  const secondaryRef = useRef<Konva.Rect>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const primary = primaryRef.current;
    const secondary = secondaryRef.current;
    if (!primary || !secondary) return;

    const CYCLE_MS = 2000;
    const MOVE_FRACTION = 0.6;
    const start = performance.now();

    // Primary band: wide
    const gradientW1 = width * 3;
    const startX1 = -gradientW1;
    const endX1 = width;
    const travel1 = endX1 - startX1;

    // Secondary band: narrower, offset by 30% of the cycle
    const gradientW2 = width * 1.5;
    const startX2 = -gradientW2;
    const endX2 = width;
    const travel2 = endX2 - startX2;
    const OFFSET_MS = CYCLE_MS * 0.3;

    function easeInOut(t: number): number {
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    }

    function bandOffset(elapsed: number, startX: number, travel: number): number | null {
      const tCycle = elapsed / CYCLE_MS;
      if (tCycle >= MOVE_FRACTION) return null; // off-screen during pause
      return startX + easeInOut(tCycle / MOVE_FRACTION) * travel;
    }

    const animate = (now: number) => {
      const raw = now - start;

      // Primary
      const elapsed1 = raw % CYCLE_MS;
      const off1 = bandOffset(elapsed1, startX1, travel1);
      if (off1 !== null) {
        primary.fillLinearGradientStartPoint({ x: off1, y: 0 });
        primary.fillLinearGradientEndPoint({ x: off1 + gradientW1, y: 0 });
        primary.fillLinearGradientColorStops([
          0, "transparent",
          0.5, highlightColor,
          1, "transparent",
        ]);
      } else {
        primary.fillLinearGradientColorStops([0, "transparent", 1, "transparent"]);
      }

      // Secondary (time-offset, half opacity via dimmer stops)
      const elapsed2 = ((raw + CYCLE_MS - OFFSET_MS) % CYCLE_MS);
      const off2 = bandOffset(elapsed2, startX2, travel2);
      if (off2 !== null) {
        secondary.fillLinearGradientStartPoint({ x: off2, y: 0 });
        secondary.fillLinearGradientEndPoint({ x: off2 + gradientW2, y: 0 });
        secondary.fillLinearGradientColorStops([
          0, "transparent",
          0.5, highlightColor,
          1, "transparent",
        ]);
      } else {
        secondary.fillLinearGradientColorStops([0, "transparent", 1, "transparent"]);
      }

      primary.getLayer()?.batchDraw();
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height, highlightColor]);

  return (
    <Group opacity={opacity}>
      <Rect
        width={width}
        height={height}
        cornerRadius={cornerRadius}
        fill={baseColor}
      />
      <Rect
        ref={primaryRef}
        width={width}
        height={height}
        cornerRadius={cornerRadius}
      />
      <Rect
        ref={secondaryRef}
        width={width}
        height={height}
        cornerRadius={cornerRadius}
        opacity={0.5}
      />
    </Group>
  );
}
