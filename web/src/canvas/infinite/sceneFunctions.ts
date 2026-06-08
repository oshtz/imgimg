import { useCallback } from "react";
import type { SnapGuide } from "../snapGuides";
import { GRID_SPACING, DOT_RADIUS, DOT_COLOR, DOT_COLOR_DARK } from "./canvasUtils";

/**
 * Returns a Konva sceneFunc callback that draws the dot grid.
 */
export function useGridSceneFunc(
  vx: number,
  vy: number,
  scale: number,
  width: number,
  height: number,
  isDark: boolean,
) {
  return useCallback(
    (context: any, shape: any) => {
      const ctx = context._context as CanvasRenderingContext2D;
      const startGX = Math.floor((-vx / scale - GRID_SPACING) / GRID_SPACING) * GRID_SPACING;
      const startGY = Math.floor((-vy / scale - GRID_SPACING) / GRID_SPACING) * GRID_SPACING;
      const endGX = startGX + width / scale + GRID_SPACING * 2;
      const endGY = startGY + height / scale + GRID_SPACING * 2;
      const r = DOT_RADIUS / scale;
      ctx.fillStyle = isDark ? DOT_COLOR_DARK : DOT_COLOR;
      ctx.beginPath();
      for (let gx = startGX; gx < endGX; gx += GRID_SPACING) {
        for (let gy = startGY; gy < endGY; gy += GRID_SPACING) {
          ctx.moveTo(gx + r, gy);
          ctx.arc(gx, gy, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      context.fillStrokeShape(shape);
    },
    [vx, vy, scale, width, height, isDark]
  );
}

/**
 * Returns a Konva sceneFunc callback that draws the drop-target highlight.
 */
export function useDropTargetSceneFunc(
  dropTargetRectRef: { readonly current: { x: number; y: number; width: number; height: number } | null },
) {
  return useCallback(
    (context: any, shape: any) => {
      const rect = dropTargetRectRef.current;
      if (!rect) {
        context.fillStrokeShape(shape);
        return;
      }
      const ctx = context._context as CanvasRenderingContext2D;
      const cr = 8; // corner radius matching FrameNode
      ctx.save();
      // Fill
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cr);
      ctx.fill();
      // Stroke
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cr);
      ctx.stroke();
      ctx.restore();
      context.fillStrokeShape(shape);
    },
    []
  );
}

/**
 * Returns a Konva sceneFunc callback that draws snap guide lines.
 */
export function useSnapGuideSceneFunc(
  snapGuidesRef: { readonly current: SnapGuide[] },
  vx: number,
  vy: number,
  scale: number,
  width: number,
  height: number,
) {
  return useCallback(
    (context: any, shape: any) => {
      const guides = snapGuidesRef.current;
      if (guides.length === 0) {
        context.fillStrokeShape(shape);
        return;
      }
      const ctx = context._context as CanvasRenderingContext2D;
      ctx.save();
      ctx.strokeStyle = "#e040fb";
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      for (const g of guides) {
        ctx.beginPath();
        if (g.orientation === "v") {
          ctx.moveTo(g.position, -vy / scale - height / scale);
          ctx.lineTo(g.position, -vy / scale + 2 * height / scale);
        } else {
          ctx.moveTo(-vx / scale - width / scale, g.position);
          ctx.lineTo(-vx / scale + 2 * width / scale, g.position);
        }
        ctx.stroke();
      }
      ctx.restore();
      context.fillStrokeShape(shape);
    },
    [vx, vy, scale, width, height]
  );
}
