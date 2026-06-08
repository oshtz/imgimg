import { useRef, useEffect, useCallback, useState } from "react";
import { useCanvas } from "./CanvasProvider";

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 140;
const PADDING = 20; // content padding inside minimap

type Props = {
  /** Full canvas container width in screen px */
  containerWidth: number;
  /** Full canvas container height in screen px */
  containerHeight: number;
};

export function CanvasMinimap({ containerWidth, containerHeight }: Props) {
  const { state, dispatch } = useCanvas();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ vpX: number; vpY: number; mx: number; my: number } | null>(null);
  const didDragRef = useRef(false);

  // Compute the world-space bounding box that the minimap covers.
  // Includes all nodes + the current viewport, so you always see both.
  const computeBounds = useCallback(() => {
    const { x: vx, y: vy, scale } = state.viewport;

    // Viewport bounds in world space
    const vpLeft = -vx / scale;
    const vpTop = -vy / scale;
    const vpRight = vpLeft + containerWidth / scale;
    const vpBottom = vpTop + containerHeight / scale;

    let minX = vpLeft;
    let minY = vpTop;
    let maxX = vpRight;
    let maxY = vpBottom;

    for (const n of state.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }

    // Add padding so nodes aren't flush against edges
    minX -= PADDING * 2;
    minY -= PADDING * 2;
    maxX += PADDING * 2;
    maxY += PADDING * 2;

    return { minX, minY, maxX, maxY, vpLeft, vpTop, vpRight, vpBottom };
  }, [state.viewport, state.nodes, containerWidth, containerHeight]);

  // Convert world coords to minimap pixel coords
  const worldToMinimap = useCallback(
    (wx: number, wy: number, bounds: ReturnType<typeof computeBounds>) => {
      const worldW = bounds.maxX - bounds.minX;
      const worldH = bounds.maxY - bounds.minY;
      const scaleX = (MINIMAP_WIDTH - PADDING * 2) / worldW;
      const scaleY = (MINIMAP_HEIGHT - PADDING * 2) / worldH;
      const s = Math.min(scaleX, scaleY);
      const offsetX = (MINIMAP_WIDTH - worldW * s) / 2;
      const offsetY = (MINIMAP_HEIGHT - worldH * s) / 2;
      return {
        x: (wx - bounds.minX) * s + offsetX,
        y: (wy - bounds.minY) * s + offsetY,
        s,
      };
    },
    [computeBounds]
  );

  // Draw the minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    const isDark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDark ? "rgba(24, 24, 27, 0.9)" : "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    if (state.nodes.length === 0) {
      ctx.fillStyle = isDark ? "#52525b" : "#a1a1aa";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No items", MINIMAP_WIDTH / 2, MINIMAP_HEIGHT / 2 + 4);
      return;
    }

    const bounds = computeBounds();
    const { s } = worldToMinimap(0, 0, bounds);

    // Draw nodes as filled rects (selected nodes highlighted)
    for (const n of state.nodes) {
      const { x, y } = worldToMinimap(n.x, n.y, bounds);
      const w = n.width * s;
      const h = n.height * s;
      const isSelected = state.selectedNodeIds.has(n.id);
      ctx.fillStyle = isSelected
        ? (isDark ? "#e4e4e7" : "#3f3f46") // zinc for selected
        : (isDark ? "#a1a1aa" : "#71717a"); // zinc for unselected
      ctx.fillRect(x, y, Math.max(w, 2), Math.max(h, 2));
    }

    // Draw viewport rectangle
    const vpTL = worldToMinimap(bounds.vpLeft, bounds.vpTop, bounds);
    const vpBR = worldToMinimap(bounds.vpRight, bounds.vpBottom, bounds);
    const vpW = vpBR.x - vpTL.x;
    const vpH = vpBR.y - vpTL.y;
    ctx.strokeStyle = isDark ? "rgba(228, 228, 231, 0.7)" : "rgba(63, 63, 70, 0.7)"; // zinc
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpTL.x, vpTL.y, vpW, vpH);
    ctx.fillStyle = isDark ? "rgba(228, 228, 231, 0.06)" : "rgba(63, 63, 70, 0.06)";
    ctx.fillRect(vpTL.x, vpTL.y, vpW, vpH);
  }, [state.nodes, state.selectedNodeIds, state.viewport, containerWidth, containerHeight, computeBounds, worldToMinimap]);

  // Click on minimap → center viewport at that world position
  const handleMinimapClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      if (state.nodes.length === 0) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const bounds = computeBounds();
      const worldW = bounds.maxX - bounds.minX;
      const worldH = bounds.maxY - bounds.minY;
      const scaleX = (MINIMAP_WIDTH - PADDING * 2) / worldW;
      const scaleY = (MINIMAP_HEIGHT - PADDING * 2) / worldH;
      const s = Math.min(scaleX, scaleY);
      const offsetX = (MINIMAP_WIDTH - worldW * s) / 2;
      const offsetY = (MINIMAP_HEIGHT - worldH * s) / 2;

      // Convert minimap px → world coords
      const worldX = (mx - offsetX) / s + bounds.minX;
      const worldY = (my - offsetY) / s + bounds.minY;

      // Center the viewport on this world position
      const { scale } = state.viewport;
      dispatch({
        type: "SET_VIEWPORT",
        viewport: {
          x: -worldX * scale + containerWidth / 2,
          y: -worldY * scale + containerHeight / 2,
          scale,
        },
      });
    },
    [state.nodes.length, state.viewport, containerWidth, containerHeight, computeBounds, dispatch]
  );

  // Drag the viewport rectangle
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (state.nodes.length === 0) return;
      didDragRef.current = false;
      setDragging(true);
      dragStartRef.current = {
        vpX: state.viewport.x,
        vpY: state.viewport.y,
        mx: e.clientX,
        my: e.clientY,
      };
      e.preventDefault();
    },
    [state.nodes.length, state.viewport]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      didDragRef.current = true;
      const bounds = computeBounds();
      const worldW = bounds.maxX - bounds.minX;
      const worldH = bounds.maxY - bounds.minY;
      const scaleX = (MINIMAP_WIDTH - PADDING * 2) / worldW;
      const scaleY = (MINIMAP_HEIGHT - PADDING * 2) / worldH;
      const s = Math.min(scaleX, scaleY);

      // Convert minimap pixel delta to world delta, then to viewport delta
      const dxMinimap = e.clientX - start.mx;
      const dyMinimap = e.clientY - start.my;
      const dxWorld = dxMinimap / s;
      const dyWorld = dyMinimap / s;

      dispatch({
        type: "SET_VIEWPORT",
        viewport: {
          x: start.vpX - dxWorld * state.viewport.scale,
          y: start.vpY - dyWorld * state.viewport.scale,
          scale: state.viewport.scale,
        },
      });
    };

    const handleMouseUp = () => {
      setDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, state.viewport.scale, computeBounds, dispatch]);

  return (
    <div className="absolute bottom-4 left-4 z-20 overflow-hidden rounded-lg border border-zinc-200 shadow-lg dark:border-zinc-700">
      <canvas
        ref={canvasRef}
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT, cursor: dragging ? "grabbing" : "pointer" }}
        onClick={handleMinimapClick}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
