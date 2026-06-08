import { useRef, useEffect } from "react";
import { Arc } from "react-konva";
import type Konva from "konva";

type Props = {
  /** Centre X in parent coordinate space */
  x: number;
  /** Centre Y in parent coordinate space */
  y: number;
  /** Outer radius of the spinner ring */
  radius?: number;
  /** Thickness of the ring stroke */
  strokeWidth?: number;
  /** Active arc colour */
  color?: string;
  /** Background ring colour */
  trackColor?: string;
};

/**
 * A Konva-native spinning arc indicator.
 * Renders a partial ring that rotates continuously via requestAnimationFrame.
 */
export function KonvaSpinner({
  x,
  y,
  radius = 16,
  strokeWidth = 3,
  color = "#71717a",      // zinc-500
  trackColor = "#a1a1aa",  // zinc-400
}: Props) {
  const arcRef = useRef<Konva.Arc>(null);
  const trackRef = useRef<Konva.Arc>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const arc = arcRef.current;
    if (!arc) return;

    const CYCLE_MS = 1000;
    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const rotation = (elapsed / CYCLE_MS) * 360;
      arc.rotation(rotation);
      arc.getLayer()?.batchDraw();
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <>
      {/* Background track ring */}
      <Arc
        ref={trackRef}
        x={x}
        y={y}
        innerRadius={radius - strokeWidth}
        outerRadius={radius}
        angle={360}
        fill={trackColor}
        opacity={0.3}
        listening={false}
      />
      {/* Spinning active arc */}
      <Arc
        ref={arcRef}
        x={x}
        y={y}
        innerRadius={radius - strokeWidth}
        outerRadius={radius}
        angle={90}
        fill={color}
        listening={false}
      />
    </>
  );
}
