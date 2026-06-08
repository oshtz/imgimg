import type { CanvasNode } from "./types";

export type SnapGuide = {
  /** "v" = vertical line (x = position), "h" = horizontal line (y = position) */
  orientation: "v" | "h";
  /** World-coordinate position of the guide line */
  position: number;
};

export type SnapResult = {
  /** Adjusted dx to apply (snapped) */
  snappedDx: number;
  /** Adjusted dy to apply (snapped) */
  snappedDy: number;
  /** Active guide lines to render */
  guides: SnapGuide[];
};

type BBox = { left: number; top: number; right: number; bottom: number; cx: number; cy: number };

function nodeBBox(n: CanvasNode): BBox {
  return {
    left: n.x,
    top: n.y,
    right: n.x + n.width,
    bottom: n.y + n.height,
    cx: n.x + n.width / 2,
    cy: n.y + n.height / 2,
  };
}

/**
 * Compute snap guides for a set of dragged nodes against stationary nodes.
 *
 * @param draggedNodes - Nodes being dragged (bounding box computed from their *original* positions + delta)
 * @param otherNodes  - All non-dragged nodes to snap against
 * @param dx          - Current drag delta X
 * @param dy          - Current drag delta Y
 * @param threshold   - Snap distance in world units (default 5)
 */
export function computeSnapGuides(
  draggedNodes: CanvasNode[],
  otherNodes: CanvasNode[],
  dx: number,
  dy: number,
  threshold = 5,
): SnapResult {
  if (draggedNodes.length === 0 || otherNodes.length === 0) {
    return { snappedDx: dx, snappedDy: dy, guides: [] };
  }

  // Compute the combined bounding box of all dragged nodes at their *dragged* position
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of draggedNodes) {
    minX = Math.min(minX, n.x + dx);
    minY = Math.min(minY, n.y + dy);
    maxX = Math.max(maxX, n.x + dx + n.width);
    maxY = Math.max(maxY, n.y + dy + n.height);
  }
  const dragBBox: BBox = {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };

  // Collect all edge positions from other nodes
  const xEdges: number[] = []; // left, center, right of each other node
  const yEdges: number[] = []; // top, middle, bottom
  for (const n of otherNodes) {
    const bb = nodeBBox(n);
    xEdges.push(bb.left, bb.cx, bb.right);
    yEdges.push(bb.top, bb.cy, bb.bottom);
  }

  // Find best snap on X axis (checking left, center, right of drag bbox)
  const dragXEdges = [dragBBox.left, dragBBox.cx, dragBBox.right];
  let bestSnapX: number | null = null;
  let bestDistX = threshold + 1;
  let snapGuideX: number | null = null;

  for (const dragEdge of dragXEdges) {
    for (const otherEdge of xEdges) {
      const dist = Math.abs(dragEdge - otherEdge);
      if (dist < bestDistX) {
        bestDistX = dist;
        bestSnapX = otherEdge - dragEdge; // correction to apply to dx
        snapGuideX = otherEdge;
      }
    }
  }

  // Find best snap on Y axis (checking top, middle, bottom)
  const dragYEdges = [dragBBox.top, dragBBox.cy, dragBBox.bottom];
  let bestSnapY: number | null = null;
  let bestDistY = threshold + 1;
  let snapGuideY: number | null = null;

  for (const dragEdge of dragYEdges) {
    for (const otherEdge of yEdges) {
      const dist = Math.abs(dragEdge - otherEdge);
      if (dist < bestDistY) {
        bestDistY = dist;
        bestSnapY = otherEdge - dragEdge;
        snapGuideY = otherEdge;
      }
    }
  }

  const snappedDx = bestSnapX !== null && bestDistX <= threshold ? dx + bestSnapX : dx;
  const snappedDy = bestSnapY !== null && bestDistY <= threshold ? dy + bestSnapY : dy;

  const guides: SnapGuide[] = [];
  if (snapGuideX !== null && bestDistX <= threshold) {
    guides.push({ orientation: "v", position: snapGuideX });
  }
  if (snapGuideY !== null && bestDistY <= threshold) {
    guides.push({ orientation: "h", position: snapGuideY });
  }

  return { snappedDx, snappedDy, guides };
}
