import type { CanvasNode, CanvasConnector, CanvasViewport } from "./types";
import { isAspectRatio } from "../workflows";

const SPACING = 30; // px gap between nodes
const DEFAULT_SIZE = 400; // default node size for placeholders

/**
 * Curated set of visually diverse aspect ratios for explore mode.
 * Includes a mix of square, landscape, portrait, and ultra-wide options.
 */
const EXPLORE_ASPECT_RATIOS = [
  "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4",
] as const;

/**
 * Pick a diverse set of aspect ratios for an explore batch.
 *
 * - Always includes the source aspect ratio.
 * - Respects workflow-level restrictions (`supportedRatios`).
 * - If the workflow doesn't support aspect ratios, returns the source ratio for all.
 * - Shuffles candidates and avoids repeats until the pool is exhausted.
 *
 * @param sourceAspectRatio  The aspect ratio of the image being explored
 * @param count              How many ratios to pick
 * @param supportedRatios    Workflow-level allowlist (undefined = all allowed)
 * @param workflowSupportsAr Whether the workflow supports aspect ratio variation at all
 * @returns Array of aspect ratio strings, length = count
 */
export function pickExploreAspectRatios(
  sourceAspectRatio: string | undefined,
  count: number,
  supportedRatios: string[] | undefined,
  workflowSupportsAr: boolean,
): string[] {
  const fallback = sourceAspectRatio ?? "1:1";

  // If workflow doesn't support aspect ratio changes, use source ratio for all
  if (!workflowSupportsAr) {
    return Array(count).fill(fallback) as string[];
  }

  // Build candidate pool
  let pool: string[];
  if (supportedRatios && supportedRatios.length > 0) {
    // Filter to only valid aspect ratios that the workflow supports
    pool = supportedRatios.filter((ar) => isAspectRatio(ar));
  } else {
    // Use the curated explore set
    pool = [...EXPLORE_ASPECT_RATIOS];
  }

  // Ensure pool is non-empty
  if (pool.length === 0) {
    return Array(count).fill(fallback) as string[];
  }

  // Ensure source ratio is in the pool
  if (!pool.includes(fallback)) {
    pool.unshift(fallback);
  }

  // Shuffle (Fisher-Yates)
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Pick count ratios, cycling through shuffled pool if count > pool.length
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(shuffled[i % shuffled.length]);
  }

  return result;
}

/**
 * Compute initial node dimensions from an aspect ratio string (e.g. "16:9").
 * Dynamically parses any "W:H" format — no hardcoded list needed.
 * Fits within a maxDim x maxDim bounding box, preserving the ratio.
 */
export function dimensionsFromAspectRatio(
  aspectRatio?: string,
  maxDim: number = DEFAULT_SIZE
): { width: number; height: number } {
  if (!aspectRatio) return { width: maxDim, height: maxDim };
  const parts = aspectRatio.split(":");
  if (parts.length !== 2) return { width: maxDim, height: maxDim };
  const rw = Number(parts[0]);
  const rh = Number(parts[1]);
  if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) {
    return { width: maxDim, height: maxDim };
  }
  if (rw >= rh) {
    return { width: maxDim, height: Math.round(maxDim * (rh / rw)) };
  }
  return { width: Math.round(maxDim * (rw / rh)), height: maxDim };
}

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Get the visible viewport rectangle in canvas coordinates.
 * Uses window dimensions as a reasonable approximation of canvas container size.
 */
function viewportRect(viewport: CanvasViewport): Rect {
  const w = (typeof window !== "undefined" ? window.innerWidth : 1200) / viewport.scale;
  const h = (typeof window !== "undefined" ? window.innerHeight : 800) / viewport.scale;
  return {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: w,
    height: h,
  };
}

/**
 * Check if a candidate position is within (or mostly within) the viewport.
 * Requires at least 50% of the item to be visible.
 */
function isInViewport(x: number, y: number, w: number, h: number, vr: Rect): boolean {
  const overlapLeft = Math.max(x, vr.x);
  const overlapTop = Math.max(y, vr.y);
  const overlapRight = Math.min(x + w, vr.x + vr.width);
  const overlapBottom = Math.min(y + h, vr.y + vr.height);
  if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return false;
  const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
  return overlapArea >= (w * h) * 0.5;
}

/**
 * Find a free position on the canvas that doesn't overlap with existing nodes.
 * Strongly prefers placing within the current viewport so the user can see the result.
 *
 * Strategy:
 * 0. If a targetFrame is provided, try to place inside it first
 * 1. Empty canvas → center in viewport
 * 2. Scan for free spots within the viewport (grid scan)
 * 3. Try just below visible content (still near viewport)
 * 4. Try just to the right of visible content
 * 5. Spiral outward from viewport center (staying close)
 * 6. Fallback: below all content
 *
 * @param targetFrame  Optional frame to prefer placing inside (e.g. the selected frame)
 */
export function findFreePosition(
  existingNodes: CanvasNode[],
  viewport: CanvasViewport,
  newWidth: number = DEFAULT_SIZE,
  newHeight: number = DEFAULT_SIZE,
  targetFrame?: CanvasNode,
): { x: number; y: number } {
  const vr = viewportRect(viewport);

  // ── Frame-aware placement ─────────────────────────────────────────
  if (targetFrame && targetFrame.type === "frame") {
    const framePos = findPositionInsideFrame(
      targetFrame, existingNodes, newWidth, newHeight,
    );
    if (framePos) return framePos;
  }

  if (existingNodes.length === 0) {
    return {
      x: vr.x + (vr.width - newWidth) / 2,
      y: vr.y + (vr.height - newHeight) / 2,
    };
  }

  const rects: Rect[] = existingNodes.map((n) => ({
    x: n.x, y: n.y, width: n.width, height: n.height,
  }));

  // ── Filter to nodes visible in/near the viewport ──────────────────
  // Use an expanded viewport (2x) so we consider nearby off-screen nodes too
  const expandedVr = {
    x: vr.x - vr.width * 0.5,
    y: vr.y - vr.height * 0.5,
    width: vr.width * 2,
    height: vr.height * 2,
  };
  const nearbyRects = rects.filter((r) =>
    r.x + r.width > expandedVr.x && r.x < expandedVr.x + expandedVr.width &&
    r.y + r.height > expandedVr.y && r.y < expandedVr.y + expandedVr.height
  );

  // Use nearby rects for overlap checks when placing in viewport,
  // fall back to all rects for global placement
  const vpRects = nearbyRects.length > 0 ? nearbyRects : rects;

  // ── Strategy 1: Grid scan within the viewport ─────────────────────
  // Try positions on a grid within the viewport, preferring top-left
  const stepX = newWidth + SPACING;
  const stepY = newHeight + SPACING;
  const padX = SPACING;
  const padY = SPACING;

  for (let y = vr.y + padY; y + newHeight <= vr.y + vr.height - padY; y += stepY) {
    for (let x = vr.x + padX; x + newWidth <= vr.x + vr.width - padX; x += stepX) {
      if (!overlapsAny(x, y, newWidth, newHeight, vpRects)) {
        return { x, y };
      }
    }
  }

  // ── Strategy 2: Below visible content, within or near viewport ────
  const visibleRects = rects.filter((r) =>
    r.x + r.width > vr.x && r.x < vr.x + vr.width &&
    r.y + r.height > vr.y && r.y < vr.y + vr.height
  );

  if (visibleRects.length > 0) {
    const visBottom = Math.max(...visibleRects.map((r) => r.y + r.height));
    const visCenterX = (Math.min(...visibleRects.map((r) => r.x)) +
      Math.max(...visibleRects.map((r) => r.x + r.width))) / 2;
    const belowVisible = {
      x: visCenterX - newWidth / 2,
      y: visBottom + SPACING,
    };
    if (!overlapsAny(belowVisible.x, belowVisible.y, newWidth, newHeight, rects) &&
        isInViewport(belowVisible.x, belowVisible.y, newWidth, newHeight, vr)) {
      return belowVisible;
    }

    // Try to the right of visible content
    const visRight = Math.max(...visibleRects.map((r) => r.x + r.width));
    const visTop = Math.min(...visibleRects.map((r) => r.y));
    const rightVisible = { x: visRight + SPACING, y: visTop };
    if (!overlapsAny(rightVisible.x, rightVisible.y, newWidth, newHeight, rects) &&
        isInViewport(rightVisible.x, rightVisible.y, newWidth, newHeight, vr)) {
      return rightVisible;
    }
  }

  // ── Strategy 3: Spiral outward from viewport center ───────────────
  const vpCenterX = vr.x + vr.width / 2;
  const vpCenterY = vr.y + vr.height / 2;
  const gridStep = Math.max(newWidth, newHeight) + SPACING;

  for (let ring = 1; ring <= 10; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const cx = vpCenterX + dx * gridStep - newWidth / 2;
        const cy = vpCenterY + dy * gridStep - newHeight / 2;
        if (!overlapsAny(cx, cy, newWidth, newHeight, rects)) {
          return { x: cx, y: cy };
        }
      }
    }
  }

  // ── Fallback: below all content, centered ─────────────────────────
  const bbBottom = Math.max(...rects.map((r) => r.y + r.height));
  const bbCenterX = (Math.min(...rects.map((r) => r.x)) +
    Math.max(...rects.map((r) => r.x + r.width))) / 2;
  return { x: bbCenterX - newWidth / 2, y: bbBottom + SPACING };
}

/**
 * Try to find a free position inside a frame, avoiding its children.
 * Uses the frame's title bar height (32px) as top padding.
 * Returns null if the item doesn't fit inside the frame.
 */
function findPositionInsideFrame(
  frame: CanvasNode,
  allNodes: CanvasNode[],
  newWidth: number,
  newHeight: number,
): { x: number; y: number } | null {
  const TITLE_BAR = 40; // frame title bar + padding
  const PAD = SPACING / 2;

  const innerLeft = frame.x + PAD;
  const innerTop = frame.y + TITLE_BAR;
  const innerRight = frame.x + frame.width - PAD;
  const innerBottom = frame.y + frame.height - PAD;

  // Check if the item can even fit
  if (newWidth > innerRight - innerLeft || newHeight > innerBottom - innerTop) {
    return null;
  }

  // Get rects of children inside this frame
  const childRects: Rect[] = allNodes
    .filter((n) => n.parentFrameId === frame.id && n.id !== frame.id)
    .map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));

  // Try top-left of frame interior
  if (!overlapsAny(innerLeft, innerTop, newWidth, newHeight, childRects)) {
    return { x: innerLeft, y: innerTop };
  }

  // Try placing below existing children (column flow within frame)
  if (childRects.length > 0) {
    const childBottom = Math.max(...childRects.map((r) => r.y + r.height));
    const belowY = childBottom + SPACING;
    if (belowY + newHeight <= innerBottom) {
      const cx = innerLeft + (innerRight - innerLeft - newWidth) / 2;
      if (!overlapsAny(cx, belowY, newWidth, newHeight, childRects)) {
        return { x: cx, y: belowY };
      }
    }

    // Try to the right of existing children
    const childRight = Math.max(...childRects.map((r) => r.x + r.width));
    const rightX = childRight + SPACING;
    if (rightX + newWidth <= innerRight) {
      if (!overlapsAny(rightX, innerTop, newWidth, newHeight, childRects)) {
        return { x: rightX, y: innerTop };
      }
    }
  }

  // Grid search inside frame bounds
  const stepX = newWidth + SPACING;
  const stepY = newHeight + SPACING;
  for (let y = innerTop; y + newHeight <= innerBottom; y += stepY) {
    for (let x = innerLeft; x + newWidth <= innerRight; x += stepX) {
      if (!overlapsAny(x, y, newWidth, newHeight, childRects)) {
        return { x, y };
      }
    }
  }

  return null; // frame is full
}

function overlapsAny(
  x: number, y: number, w: number, h: number, rects: Rect[]
): boolean {
  for (const r of rects) {
    if (
      x < r.x + r.width + SPACING &&
      x + w + SPACING > r.x &&
      y < r.y + r.height + SPACING &&
      y + h + SPACING > r.y
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Find positions for a batch of items using masonry (shortest-column) packing.
 * The batch origin is placed within the viewport so the user can see the results.
 */
export function findFreePositionsForBatch(
  existingNodes: CanvasNode[],
  viewport: CanvasViewport,
  count: number,
  itemWidth: number = DEFAULT_SIZE,
  itemHeight: number = DEFAULT_SIZE
): { x: number; y: number }[] {
  if (count <= 0) return [];
  if (count === 1) return [findFreePosition(existingNodes, viewport, itemWidth, itemHeight)];

  // Column count: fit within viewport width, capped at 4
  const vr = viewportRect(viewport);
  const maxColsByViewport = Math.max(1, Math.floor((vr.width + SPACING) / (itemWidth + SPACING)));
  const cols = Math.min(count, Math.min(4, maxColsByViewport));

  // Use masonry (shortest-column-first) packing
  const colHeights = new Array(cols).fill(0) as number[];
  const assignments: { col: number; yOffset: number }[] = [];

  for (let i = 0; i < count; i++) {
    let shortestCol = 0;
    for (let c = 1; c < cols; c++) {
      if (colHeights[c] < colHeights[shortestCol]) shortestCol = c;
    }
    assignments.push({ col: shortestCol, yOffset: colHeights[shortestCol] });
    colHeights[shortestCol] += itemHeight + SPACING;
  }

  // Total footprint of the batch block
  const blockW = cols * itemWidth + (cols - 1) * SPACING;
  const blockH = Math.max(...colHeights) - SPACING;

  // Find a free position for the whole block (viewport-aware)
  const origin = findFreePosition(existingNodes, viewport, blockW, blockH);

  return assignments.map((a) => ({
    x: origin.x + a.col * (itemWidth + SPACING),
    y: origin.y + a.yOffset,
  }));
}

/**
 * Compute a masonry cluster layout anchored to the right of a source node.
 *
 * Items are distributed across 2-3 columns using shortest-column-first packing.
 * If the resulting cluster overlaps existing canvas nodes, it shifts right until clear.
 *
 * @param sourceNode  The node being explored (anchor point)
 * @param items       Dimensions for each item to place
 * @param existingNodes  All current canvas nodes (for overlap avoidance)
 * @returns Array of { x, y } positions, one per item
 */
export function findMasonryClusterPositions(
  sourceNode: { x: number; y: number; width: number; height: number },
  items: { width: number; height: number }[],
  existingNodes: CanvasNode[]
): { x: number; y: number }[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    // Single item: place directly to the right of the source node
    return [{ x: sourceNode.x + sourceNode.width + SPACING * 2, y: sourceNode.y }];
  }

  const colCount = Math.min(3, items.length);
  // Track the current height of each column (for shortest-column-first packing)
  const colHeights = new Array(colCount).fill(0) as number[];
  // Track column widths (max item width per column)
  const colWidths = new Array(colCount).fill(0) as number[];
  // Track which column each item is assigned to, and its y-offset within that column
  const assignments: { col: number; yOffset: number }[] = [];

  for (const item of items) {
    // Find the shortest column
    let shortestCol = 0;
    for (let c = 1; c < colCount; c++) {
      if (colHeights[c] < colHeights[shortestCol]) shortestCol = c;
    }
    const yOffset = colHeights[shortestCol];
    assignments.push({ col: shortestCol, yOffset });
    colHeights[shortestCol] += item.height + SPACING;
    colWidths[shortestCol] = Math.max(colWidths[shortestCol], item.width);
  }

  // Compute column x-offsets (relative to cluster origin)
  const colXOffsets: number[] = [];
  let xAccum = 0;
  for (let c = 0; c < colCount; c++) {
    colXOffsets.push(xAccum);
    xAccum += (colWidths[c] || items[0].width) + SPACING;
  }

  // Cluster origin: to the right of source node, top-aligned
  let originX = sourceNode.x + sourceNode.width + SPACING * 2;
  const originY = sourceNode.y;

  // Compute cluster bounding box for overlap checking
  const clusterW = xAccum - SPACING; // total width minus trailing spacing
  const clusterH = Math.max(...colHeights) - SPACING; // total height minus trailing spacing

  // Build existing rects for overlap check — only consider nodes in the
  // horizontal band near the cluster (avoids far-away nodes pushing it off-screen)
  const bandTop = originY - SPACING;
  const bandBottom = originY + clusterH + SPACING;
  const rects: Rect[] = existingNodes
    .filter((n) => {
      // Exclude source node
      if (n.x === sourceNode.x && n.y === sourceNode.y && n.width === sourceNode.width && n.height === sourceNode.height) return false;
      // Only consider nodes that vertically overlap with the cluster band
      if (n.y + n.height < bandTop || n.y > bandBottom) return false;
      return true;
    })
    .map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));

  // Shift cluster right if it overlaps nearby nodes (up to 5 attempts)
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!overlapsAny(originX, originY, clusterW, clusterH, rects)) break;
    originX += clusterW + SPACING;
  }

  // Build final positions
  return items.map((_, i) => ({
    x: originX + colXOffsets[assignments[i].col],
    y: originY + assignments[i].yOffset,
  }));
}

// ─── Auto-arrange layout algorithms ──────────────────────────────────────────

export type ArrangeMode = "grid" | "tree" | "masonry";

/**
 * Compute new positions for a set of nodes arranged in a tight grid.
 * Preserves the bounding-box origin (top-left) of the selection.
 * Sorts nodes left-to-right, top-to-bottom by their current position.
 * Uses per-column max widths and per-row max heights so nodes never overlap,
 * and centers each node within its cell.
 *
 * @returns Map of nodeId → new { x, y }
 */
export function arrangeGrid(
  nodes: CanvasNode[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length < 2) return result;

  // Sort by position: top-to-bottom, then left-to-right
  const sorted = [...nodes].sort((a, b) => {
    const rowA = Math.round(a.y / 100);
    const rowB = Math.round(b.y / 100);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });

  // Determine column count: try to match a roughly square grid
  const cols = Math.max(1, Math.round(Math.sqrt(sorted.length)));
  const rows = Math.ceil(sorted.length / cols);

  // Compute per-column max width and per-row max height
  const colWidths = new Array(cols).fill(0) as number[];
  const rowHeights = new Array(rows).fill(0) as number[];
  for (let i = 0; i < sorted.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    colWidths[col] = Math.max(colWidths[col], sorted[i].width);
    rowHeights[row] = Math.max(rowHeights[row], sorted[i].height);
  }

  // Compute column x-offsets and row y-offsets
  const colX: number[] = [0];
  for (let c = 1; c < cols; c++) {
    colX.push(colX[c - 1] + colWidths[c - 1] + SPACING);
  }
  const rowY: number[] = [0];
  for (let r = 1; r < rows; r++) {
    rowY.push(rowY[r - 1] + rowHeights[r - 1] + SPACING);
  }

  // Origin = top-left of current bounding box
  const originX = Math.min(...sorted.map((n) => n.x));
  const originY = Math.min(...sorted.map((n) => n.y));

  for (let i = 0; i < sorted.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Center node within its cell
    const cellCenterX = colX[col] + colWidths[col] / 2;
    const cellCenterY = rowY[row] + rowHeights[row] / 2;
    result.set(sorted[i].id, {
      x: originX + cellCenterX - sorted[i].width / 2,
      y: originY + cellCenterY - sorted[i].height / 2,
    });
  }

  return result;
}

/**
 * Arrange nodes in a masonry (Pinterest-style) layout.
 * Every item is scaled to fill its column width (preserving aspect ratio),
 * then placed into the shortest column. This produces a tight, gap-free layout.
 * Preserves the bounding-box origin (top-left) of the selection.
 *
 * @returns Map of nodeId → new { x, y, width, height } (includes resize)
 */
export function arrangeMasonry(
  nodes: CanvasNode[],
): Map<string, { x: number; y: number; width?: number; height?: number }> {
  const result = new Map<string, { x: number; y: number; width?: number; height?: number }>();
  if (nodes.length < 2) return result;

  // Sort by position: top-to-bottom, then left-to-right
  const sorted = [...nodes].sort((a, b) => {
    const rowA = Math.round(a.y / 100);
    const rowB = Math.round(b.y / 100);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });

  // Determine column count based on item count
  const colCount = sorted.length <= 3 ? sorted.length
    : sorted.length <= 8 ? 3
    : sorted.length <= 15 ? 4
    : 5;

  // Use the median width as the standard column width
  const widths = sorted.map((n) => n.width).sort((a, b) => a - b);
  const colWidth = widths[Math.floor(widths.length / 2)];

  // Origin = top-left of current bounding box
  const originX = Math.min(...sorted.map((n) => n.x));
  const originY = Math.min(...sorted.map((n) => n.y));

  // Track column heights and x-offsets
  const colHeights = new Array(colCount).fill(0) as number[];
  const colXOffsets: number[] = [];
  for (let c = 0; c < colCount; c++) {
    colXOffsets.push(c * (colWidth + SPACING));
  }

  for (const node of sorted) {
    // Find shortest column
    let shortestCol = 0;
    for (let c = 1; c < colCount; c++) {
      if (colHeights[c] < colHeights[shortestCol]) shortestCol = c;
    }

    // Scale item to fit column width, preserving aspect ratio
    const aspect = node.height / Math.max(node.width, 1);
    const newW = colWidth;
    const newH = Math.round(colWidth * aspect);

    result.set(node.id, {
      x: originX + colXOffsets[shortestCol],
      y: originY + colHeights[shortestCol],
      width: newW,
      height: newH,
    });

    colHeights[shortestCol] += newH + SPACING;
  }

  return result;
}

/**
 * Build a tree from connectors and lay out nodes hierarchically (left-to-right).
 * Nodes without connectors are arranged in a row below the tree.
 *
 * @returns Map of nodeId → new { x, y }
 */
export function arrangeLineageTree(
  nodes: CanvasNode[],
  connectors: CanvasConnector[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length < 2) return result;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency from connectors (only between nodes in our set)
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const c of connectors) {
    if (!nodeIds.has(c.fromNodeId) || !nodeIds.has(c.toNodeId)) continue;
    if (!children.has(c.fromNodeId)) children.set(c.fromNodeId, []);
    children.get(c.fromNodeId)!.push(c.toNodeId);
    hasParent.add(c.toNodeId);
  }

  // Find roots (nodes with no parent in this set)
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  // Nodes not in any tree (no connectors touching them)
  const orphans = nodes.filter(
    (n) => !hasParent.has(n.id) && !children.has(n.id),
  );
  const orphanIds = new Set(orphans.map((n) => n.id));
  const treeRoots = roots.filter((n) => !orphanIds.has(n.id));

  // If there are no tree relationships at all, fall back to grid
  if (treeRoots.length === 0) {
    return arrangeGrid(nodes);
  }

  // Origin = top-left of current bounding box
  const originX = Math.min(...nodes.map((n) => n.x));
  const originY = Math.min(...nodes.map((n) => n.y));

  const H_GAP = SPACING * 3; // horizontal gap between tree levels
  const V_GAP = SPACING;     // vertical gap between siblings

  // Compute subtree heights (for centering parents among children)
  const subtreeHeight = new Map<string, number>();

  function computeSubtreeHeight(id: string): number {
    if (subtreeHeight.has(id)) return subtreeHeight.get(id)!;
    const node = nodeMap.get(id)!;
    const kids = children.get(id);
    if (!kids || kids.length === 0) {
      const h = node.height;
      subtreeHeight.set(id, h);
      return h;
    }
    let total = 0;
    for (const kid of kids) {
      if (total > 0) total += V_GAP;
      total += computeSubtreeHeight(kid);
    }
    const h = Math.max(total, node.height);
    subtreeHeight.set(id, h);
    return h;
  }

  // Layout a subtree starting at (x, y), returns the height consumed
  function layoutSubtree(id: string, x: number, y: number): number {
    const node = nodeMap.get(id)!;
    const kids = children.get(id);
    const sh = subtreeHeight.get(id)!;

    if (!kids || kids.length === 0) {
      result.set(id, { x, y: y + (sh - node.height) / 2 });
      return sh;
    }

    // Layout children first
    const childX = x + node.width + H_GAP;
    let childY = y;
    for (const kid of kids) {
      const kidH = layoutSubtree(kid, childX, childY);
      childY += kidH + V_GAP;
    }

    // Center parent vertically among its children
    const firstChild = result.get(kids[0])!;
    const lastChild = result.get(kids[kids.length - 1])!;
    const lastNode = nodeMap.get(kids[kids.length - 1])!;
    const childrenMidY = (firstChild.y + lastChild.y + lastNode.height) / 2;

    result.set(id, { x, y: childrenMidY - node.height / 2 });
    return sh;
  }

  // Layout each tree root
  let currentY = originY;
  for (const root of treeRoots) {
    computeSubtreeHeight(root.id);
    layoutSubtree(root.id, originX, currentY);
    currentY += subtreeHeight.get(root.id)! + V_GAP * 2;
  }

  // Layout orphans in a row below the tree
  if (orphans.length > 0) {
    currentY += SPACING;
    let orphanX = originX;
    for (const orphan of orphans) {
      result.set(orphan.id, { x: orphanX, y: currentY });
      orphanX += orphan.width + SPACING;
    }
  }

  return result;
}
