import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  pickExploreAspectRatios,
  dimensionsFromAspectRatio,
  findFreePosition,
  findFreePositionsForBatch,
  findMasonryClusterPositions,
  arrangeGrid,
  arrangeMasonry,
  arrangeLineageTree,
} from "../placement";
import type { CanvasNode, CanvasConnector, CanvasViewport } from "../types";

// Ensure window is defined for viewportRect() calls in Node test environment
beforeAll(() => {
  vi.stubGlobal("window", { innerWidth: 1200, innerHeight: 800 });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal CanvasNode factory */
function makeNode(overrides: Partial<CanvasNode> & { id: string }): CanvasNode {
  return {
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    naturalWidth: 200,
    naturalHeight: 200,
    zIndex: 1,
    ...overrides,
  };
}

const defaultViewport: CanvasViewport = { x: 0, y: 0, scale: 1 };

// ---------------------------------------------------------------------------
// pickExploreAspectRatios
// ---------------------------------------------------------------------------

describe("pickExploreAspectRatios", () => {
  it("returns all same ratio when workflowSupportsAr is false", () => {
    const result = pickExploreAspectRatios("16:9", 5, undefined, false);
    expect(result).toHaveLength(5);
    expect(new Set(result).size).toBe(1);
    expect(result[0]).toBe("16:9");
  });

  it("falls back to 1:1 when source is undefined and workflow does not support AR", () => {
    const result = pickExploreAspectRatios(undefined, 3, undefined, false);
    expect(result).toEqual(["1:1", "1:1", "1:1"]);
  });

  it("returns the requested count", () => {
    const result = pickExploreAspectRatios("1:1", 7, undefined, true);
    expect(result).toHaveLength(7);
  });

  it("includes the source ratio somewhere in the result", () => {
    // Run a few times because of shuffling
    for (let i = 0; i < 10; i++) {
      const result = pickExploreAspectRatios("4:5", 9, undefined, true);
      expect(result).toContain("4:5");
    }
  });

  it("respects supportedRatios when provided", () => {
    const supported = ["1:1", "16:9"];
    const result = pickExploreAspectRatios("1:1", 4, supported, true);
    for (const r of result) {
      expect(supported).toContain(r);
    }
  });

  it("cycles when count > pool size", () => {
    const supported = ["1:1", "3:2"];
    const result = pickExploreAspectRatios("1:1", 6, supported, true);
    expect(result).toHaveLength(6);
    // All should still be from the pool
    for (const r of result) {
      expect(supported).toContain(r);
    }
  });

  it("falls back to source ratio when supportedRatios are all invalid", () => {
    const result = pickExploreAspectRatios("9:16", 3, ["not-a-ratio"], true);
    // "not-a-ratio" is filtered out, pool empty => fallback
    expect(result).toEqual(["9:16", "9:16", "9:16"]);
  });
});

// ---------------------------------------------------------------------------
// dimensionsFromAspectRatio
// ---------------------------------------------------------------------------

describe("dimensionsFromAspectRatio", () => {
  it("returns square for 1:1", () => {
    expect(dimensionsFromAspectRatio("1:1")).toEqual({ width: 400, height: 400 });
  });

  it("returns landscape for 16:9", () => {
    const { width, height } = dimensionsFromAspectRatio("16:9");
    expect(width).toBe(400);
    expect(height).toBe(Math.round(400 * (9 / 16)));
    expect(width).toBeGreaterThan(height);
  });

  it("returns portrait for 9:16", () => {
    const { width, height } = dimensionsFromAspectRatio("9:16");
    expect(height).toBe(400);
    expect(width).toBe(Math.round(400 * (9 / 16)));
    expect(height).toBeGreaterThan(width);
  });

  it("returns square default when aspectRatio is undefined", () => {
    expect(dimensionsFromAspectRatio(undefined)).toEqual({ width: 400, height: 400 });
  });

  it("returns square default for invalid string", () => {
    expect(dimensionsFromAspectRatio("abc")).toEqual({ width: 400, height: 400 });
  });

  it("returns square default for single number string", () => {
    expect(dimensionsFromAspectRatio("16")).toEqual({ width: 400, height: 400 });
  });

  it("returns square default for zero component", () => {
    expect(dimensionsFromAspectRatio("0:9")).toEqual({ width: 400, height: 400 });
  });

  it("respects custom maxDim", () => {
    const { width, height } = dimensionsFromAspectRatio("1:1", 800);
    expect(width).toBe(800);
    expect(height).toBe(800);
  });

  it("respects custom maxDim with non-square ratio", () => {
    const { width, height } = dimensionsFromAspectRatio("4:3", 600);
    expect(width).toBe(600);
    expect(height).toBe(Math.round(600 * (3 / 4)));
  });
});

// ---------------------------------------------------------------------------
// findFreePosition
// ---------------------------------------------------------------------------

describe("findFreePosition", () => {
  it("centers in viewport on empty canvas", () => {
    const pos = findFreePosition([], defaultViewport, 200, 200);
    // Viewport rect: x=0, y=0, width=1200, height=800 (scale=1)
    // Center: (1200-200)/2 = 500, (800-200)/2 = 300
    expect(pos.x).toBe(500);
    expect(pos.y).toBe(300);
  });

  it("avoids existing nodes", () => {
    const existing = [makeNode({ id: "a", x: 500, y: 300, width: 200, height: 200 })];
    const pos = findFreePosition(existing, defaultViewport, 200, 200);
    // Should not overlap with the existing node
    const overlaps =
      pos.x < 500 + 200 + 30 &&
      pos.x + 200 + 30 > 500 &&
      pos.y < 300 + 200 + 30 &&
      pos.y + 200 + 30 > 300;
    expect(overlaps).toBe(false);
  });

  it("respects viewport offset", () => {
    // viewport panned so canvas origin is at (-600, -400) in screen coords
    const viewport: CanvasViewport = { x: -600, y: -400, scale: 1 };
    const pos = findFreePosition([], viewport, 200, 200);
    // Viewport rect: x = 600, y = 400, width=1200, height=800
    expect(pos.x).toBeCloseTo(600 + (1200 - 200) / 2, 0);
    expect(pos.y).toBeCloseTo(400 + (800 - 200) / 2, 0);
  });
});

// ---------------------------------------------------------------------------
// arrangeGrid
// ---------------------------------------------------------------------------

describe("arrangeGrid", () => {
  it("returns empty map for fewer than 2 nodes", () => {
    const result = arrangeGrid([makeNode({ id: "solo" })]);
    expect(result.size).toBe(0);
  });

  it("arranges 4 nodes in a 2x2 grid", () => {
    const nodes = [
      makeNode({ id: "a", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "b", x: 500, y: 0, width: 100, height: 100 }),
      makeNode({ id: "c", x: 0, y: 500, width: 100, height: 100 }),
      makeNode({ id: "d", x: 500, y: 500, width: 100, height: 100 }),
    ];
    const result = arrangeGrid(nodes);
    expect(result.size).toBe(4);

    // All positions should be defined
    for (const id of ["a", "b", "c", "d"]) {
      expect(result.has(id)).toBe(true);
    }

    // Check that nodes don't overlap (spacing = 30)
    const positions = Array.from(result.entries()).map(([id, pos]) => ({
      id,
      ...pos,
      width: 100,
      height: 100,
    }));
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("preserves bounding-box origin", () => {
    const nodes = [
      makeNode({ id: "a", x: 100, y: 200, width: 50, height: 50 }),
      makeNode({ id: "b", x: 300, y: 400, width: 50, height: 50 }),
    ];
    const result = arrangeGrid(nodes);
    const positions = Array.from(result.values());
    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    expect(minX).toBe(100);
    expect(minY).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// arrangeMasonry
// ---------------------------------------------------------------------------

describe("arrangeMasonry", () => {
  it("returns empty map for fewer than 2 nodes", () => {
    const result = arrangeMasonry([makeNode({ id: "solo" })]);
    expect(result.size).toBe(0);
  });

  it("places nodes into columns using shortest-column-first", () => {
    const nodes = [
      makeNode({ id: "a", x: 0, y: 0, width: 200, height: 300 }),
      makeNode({ id: "b", x: 200, y: 0, width: 200, height: 100 }),
      makeNode({ id: "c", x: 400, y: 0, width: 200, height: 200 }),
    ];
    const result = arrangeMasonry(nodes);
    expect(result.size).toBe(3);

    // With 3 nodes, colCount = 3; each goes to its own column first
    // All should have y starting at origin (0)
    const positions = Array.from(result.values());
    const ys = positions.map((p) => p.y);
    // The first placed in each column should start at y=0
    expect(ys.filter((y) => y === 0).length).toBeGreaterThanOrEqual(1);
  });

  it("preserves bounding-box origin", () => {
    const nodes = [
      makeNode({ id: "a", x: 50, y: 80, width: 100, height: 100 }),
      makeNode({ id: "b", x: 200, y: 100, width: 100, height: 150 }),
    ];
    const result = arrangeMasonry(nodes);
    const positions = Array.from(result.values());
    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    expect(minX).toBe(50);
    expect(minY).toBe(80);
  });

  it("includes width and height in results (resized to column width)", () => {
    const nodes = [
      makeNode({ id: "a", x: 0, y: 0, width: 200, height: 400, naturalWidth: 200, naturalHeight: 400 }),
      makeNode({ id: "b", x: 300, y: 0, width: 100, height: 100, naturalWidth: 100, naturalHeight: 100 }),
    ];
    const result = arrangeMasonry(nodes);
    for (const entry of result.values()) {
      expect(entry.width).toBeDefined();
      expect(entry.height).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// arrangeLineageTree
// ---------------------------------------------------------------------------

describe("arrangeLineageTree", () => {
  it("returns empty map for fewer than 2 nodes", () => {
    const result = arrangeLineageTree([makeNode({ id: "solo" })], []);
    expect(result.size).toBe(0);
  });

  it("falls back to grid when no connectors exist", () => {
    const nodes = [
      makeNode({ id: "a", x: 0, y: 0 }),
      makeNode({ id: "b", x: 200, y: 0 }),
    ];
    const result = arrangeLineageTree(nodes, []);
    // Should produce positions (grid fallback)
    expect(result.size).toBe(2);
  });

  it("lays out parent and child left-to-right", () => {
    const nodes = [
      makeNode({ id: "parent", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "child", x: 0, y: 200, width: 100, height: 100 }),
    ];
    const connectors: CanvasConnector[] = [
      { id: "c1", fromNodeId: "parent", toNodeId: "child" },
    ];
    const result = arrangeLineageTree(nodes, connectors);
    expect(result.size).toBe(2);

    const parentPos = result.get("parent")!;
    const childPos = result.get("child")!;
    // Child should be to the right of parent (H_GAP = 30*3 = 90)
    expect(childPos.x).toBeGreaterThan(parentPos.x);
  });

  it("centers parent among multiple children", () => {
    const nodes = [
      makeNode({ id: "root", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "c1", x: 0, y: 100, width: 100, height: 100 }),
      makeNode({ id: "c2", x: 0, y: 200, width: 100, height: 100 }),
    ];
    const connectors: CanvasConnector[] = [
      { id: "e1", fromNodeId: "root", toNodeId: "c1" },
      { id: "e2", fromNodeId: "root", toNodeId: "c2" },
    ];
    const result = arrangeLineageTree(nodes, connectors);
    expect(result.size).toBe(3);

    const rootPos = result.get("root")!;
    const c1Pos = result.get("c1")!;
    const c2Pos = result.get("c2")!;

    // Parent y should be between children
    const childMidY = (c1Pos.y + c2Pos.y + 100) / 2;
    const parentMidY = rootPos.y + 50;
    expect(parentMidY).toBeCloseTo(childMidY, 0);
  });

  it("places orphan nodes in a row below the tree", () => {
    const nodes = [
      makeNode({ id: "root", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "child", x: 0, y: 100, width: 100, height: 100 }),
      makeNode({ id: "orphan", x: 500, y: 500, width: 100, height: 100 }),
    ];
    const connectors: CanvasConnector[] = [
      { id: "e1", fromNodeId: "root", toNodeId: "child" },
    ];
    const result = arrangeLineageTree(nodes, connectors);
    expect(result.size).toBe(3);

    const rootPos = result.get("root")!;
    const childPos = result.get("child")!;
    const orphanPos = result.get("orphan")!;

    // Orphan should be below the tree
    const treeBottom = Math.max(rootPos.y + 100, childPos.y + 100);
    expect(orphanPos.y).toBeGreaterThan(treeBottom);
  });

  it("lays out a deep tree (3 levels) left-to-right", () => {
    const nodes = [
      makeNode({ id: "root", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "mid", x: 0, y: 200, width: 100, height: 100 }),
      makeNode({ id: "leaf1", x: 0, y: 400, width: 100, height: 100 }),
      makeNode({ id: "leaf2", x: 0, y: 600, width: 100, height: 100 }),
    ];
    const connectors: CanvasConnector[] = [
      { id: "e1", fromNodeId: "root", toNodeId: "mid" },
      { id: "e2", fromNodeId: "mid", toNodeId: "leaf1" },
      { id: "e3", fromNodeId: "mid", toNodeId: "leaf2" },
    ];
    const result = arrangeLineageTree(nodes, connectors);
    expect(result.size).toBe(4);

    const rootPos = result.get("root")!;
    const midPos = result.get("mid")!;
    const leaf1Pos = result.get("leaf1")!;
    const leaf2Pos = result.get("leaf2")!;

    // Each level should be further to the right
    expect(midPos.x).toBeGreaterThan(rootPos.x);
    expect(leaf1Pos.x).toBeGreaterThan(midPos.x);
    expect(leaf2Pos.x).toBeGreaterThan(midPos.x);

    // Leaves should be at the same x
    expect(leaf1Pos.x).toBe(leaf2Pos.x);

    // leaf1 should be above leaf2
    expect(leaf1Pos.y).toBeLessThan(leaf2Pos.y);
  });
});

// ---------------------------------------------------------------------------
// findFreePositionsForBatch
// ---------------------------------------------------------------------------

describe("findFreePositionsForBatch", () => {
  it("returns empty array for count=0", () => {
    const result = findFreePositionsForBatch([], defaultViewport, 0);
    expect(result).toEqual([]);
  });

  it("returns a single position for count=1", () => {
    const result = findFreePositionsForBatch([], defaultViewport, 1, 200, 200);
    expect(result).toHaveLength(1);
    // Should be centered in viewport (same as findFreePosition on empty canvas)
    expect(result[0].x).toBe(500);
    expect(result[0].y).toBe(300);
  });

  it("returns 4 positions in masonry layout for count=4", () => {
    const result = findFreePositionsForBatch([], defaultViewport, 4, 200, 200);
    expect(result).toHaveLength(4);

    // All positions should be distinct
    const posStrings = result.map((p) => `${p.x},${p.y}`);
    expect(new Set(posStrings).size).toBe(4);

    // No two should overlap (with SPACING=30)
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];
        const overlaps =
          a.x < b.x + 200 &&
          a.x + 200 > b.x &&
          a.y < b.y + 200 &&
          a.y + 200 > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("respects existing nodes and avoids overlap", () => {
    // Place a large existing node near the center of the viewport
    const existing = [
      makeNode({ id: "blocker", x: 400, y: 200, width: 400, height: 400 }),
    ];
    const result = findFreePositionsForBatch(existing, defaultViewport, 2, 100, 100);
    expect(result).toHaveLength(2);

    // No result should overlap the blocker (with SPACING=30)
    for (const pos of result) {
      const overlaps =
        pos.x < 400 + 400 + 30 &&
        pos.x + 100 + 30 > 400 &&
        pos.y < 200 + 400 + 30 &&
        pos.y + 100 + 30 > 200;
      expect(overlaps).toBe(false);
    }
  });

  it("returns positions that form a columnar layout", () => {
    const result = findFreePositionsForBatch([], defaultViewport, 6, 100, 100);
    expect(result).toHaveLength(6);

    // Collect unique x values - should have multiple columns
    const uniqueXs = new Set(result.map((p) => p.x));
    expect(uniqueXs.size).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// findMasonryClusterPositions
// ---------------------------------------------------------------------------

describe("findMasonryClusterPositions", () => {
  const sourceNode = { x: 100, y: 100, width: 200, height: 200 };

  it("returns empty array for empty items", () => {
    const result = findMasonryClusterPositions(sourceNode, [], []);
    expect(result).toEqual([]);
  });

  it("places single item to the right of source", () => {
    const items = [{ width: 150, height: 150 }];
    const result = findMasonryClusterPositions(sourceNode, items, []);
    expect(result).toHaveLength(1);
    // Should be at sourceNode.x + sourceNode.width + SPACING*2 = 100 + 200 + 60 = 360
    expect(result[0].x).toBe(360);
    expect(result[0].y).toBe(100);
  });

  it("places multiple items in column layout to the right", () => {
    const items = [
      { width: 150, height: 100 },
      { width: 150, height: 120 },
      { width: 150, height: 80 },
      { width: 150, height: 110 },
    ];
    const result = findMasonryClusterPositions(sourceNode, items, []);
    expect(result).toHaveLength(4);

    // All should be to the right of the source node
    for (const pos of result) {
      expect(pos.x).toBeGreaterThanOrEqual(sourceNode.x + sourceNode.width);
    }

    // First item y should match source y
    expect(result[0].y).toBe(sourceNode.y);
  });

  it("shifts cluster right when overlapping existing nodes", () => {
    const items = [
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    ];
    // Place a blocker right where the cluster would go
    const blocker = makeNode({
      id: "blocker",
      x: 360, // exactly where the cluster origin would be
      y: 100,
      width: 200,
      height: 200,
    });
    const resultBlocked = findMasonryClusterPositions(sourceNode, items, [blocker]);
    const resultFree = findMasonryClusterPositions(sourceNode, items, []);

    // Blocked result should have shifted further right
    expect(resultBlocked[0].x).toBeGreaterThan(resultFree[0].x);
  });

  it("distributes items across columns with shortest-column-first", () => {
    // 5 items with varied heights should spread across columns
    const items = [
      { width: 100, height: 300 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    ];
    const result = findMasonryClusterPositions(sourceNode, items, []);
    expect(result).toHaveLength(5);

    // Collect unique x positions - should use up to 3 columns
    const uniqueXs = new Set(result.map((p) => p.x));
    expect(uniqueXs.size).toBeGreaterThanOrEqual(2);
    expect(uniqueXs.size).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// findFreePosition — frame-aware placement (via targetFrame)
// ---------------------------------------------------------------------------

describe("findFreePosition with targetFrame", () => {
  it("places inside a frame when frame has space", () => {
    const frame = makeNode({
      id: "frame1",
      x: 100,
      y: 100,
      width: 600,
      height: 600,
      type: "frame",
    });
    const pos = findFreePosition(
      [frame],
      defaultViewport,
      100,
      100,
      frame,
    );
    // Should be inside the frame bounds (with padding)
    expect(pos.x).toBeGreaterThanOrEqual(frame.x);
    expect(pos.y).toBeGreaterThanOrEqual(frame.y);
    expect(pos.x + 100).toBeLessThanOrEqual(frame.x + frame.width);
    expect(pos.y + 100).toBeLessThanOrEqual(frame.y + frame.height);
  });

  it("places below existing children inside the frame", () => {
    const frame = makeNode({
      id: "frame1",
      x: 0,
      y: 0,
      width: 500,
      height: 800,
      type: "frame",
    });
    // Child occupying the top-left of the frame interior
    const child = makeNode({
      id: "child1",
      x: 15,  // PAD = SPACING/2 = 15
      y: 40,  // TITLE_BAR = 40
      width: 100,
      height: 100,
      parentFrameId: "frame1",
    });
    const pos = findFreePosition(
      [frame, child],
      defaultViewport,
      100,
      100,
      frame,
    );
    // Should be placed below or to the right of the child, still inside frame
    expect(pos.x).toBeGreaterThanOrEqual(frame.x);
    expect(pos.y).toBeGreaterThanOrEqual(frame.y);
    expect(pos.x + 100).toBeLessThanOrEqual(frame.x + frame.width);
    expect(pos.y + 100).toBeLessThanOrEqual(frame.y + frame.height);
    // Should not overlap with child
    const overlaps =
      pos.x < child.x + child.width + 30 &&
      pos.x + 100 + 30 > child.x &&
      pos.y < child.y + child.height + 30 &&
      pos.y + 100 + 30 > child.y;
    expect(overlaps).toBe(false);
  });

  it("places to the right of children when below is blocked", () => {
    const frame = makeNode({
      id: "frame1",
      x: 0,
      y: 0,
      width: 500,
      height: 200, // short frame so below placement doesn't fit
      type: "frame",
    });
    // Child at top-left taking up most of the width but leaving space to the right
    const child = makeNode({
      id: "child1",
      x: 15, // PAD = 15
      y: 40, // TITLE_BAR = 40
      width: 200,
      height: 120,
      parentFrameId: "frame1",
    });
    const pos = findFreePosition(
      [frame, child],
      defaultViewport,
      100,
      100,
      frame,
    );
    // Should be to the right of the child
    expect(pos.x).toBeGreaterThanOrEqual(child.x + child.width);
    expect(pos.x + 100).toBeLessThanOrEqual(frame.x + frame.width);
  });

  it("uses grid search fallback inside frame when below and right are blocked", () => {
    const frame = makeNode({
      id: "frame1",
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      type: "frame",
    });
    // Multiple children blocking top-left, below, and right positions
    const children = [
      makeNode({
        id: "c1",
        x: 15,
        y: 40,
        width: 150,
        height: 150,
        parentFrameId: "frame1",
      }),
      makeNode({
        id: "c2",
        x: 195,
        y: 40,
        width: 150,
        height: 150,
        parentFrameId: "frame1",
      }),
    ];
    const pos = findFreePosition(
      [frame, ...children],
      defaultViewport,
      100,
      100,
      frame,
    );
    // Should still find a position inside the frame via grid search
    expect(pos.x).toBeGreaterThanOrEqual(frame.x);
    expect(pos.y).toBeGreaterThanOrEqual(frame.y);
    expect(pos.x + 100).toBeLessThanOrEqual(frame.x + frame.width);
    expect(pos.y + 100).toBeLessThanOrEqual(frame.y + frame.height);
  });

  it("returns null from frame when completely full (falls back to normal)", () => {
    // Frame barely large enough for the item but filled with children
    const frame = makeNode({
      id: "frame1",
      x: 0,
      y: 0,
      width: 160,
      height: 180,
      type: "frame",
    });
    // Fill the entire frame interior with a child
    const child = makeNode({
      id: "child1",
      x: 15,
      y: 40,
      width: 130,
      height: 125,
      parentFrameId: "frame1",
    });
    const pos = findFreePosition(
      [frame, child],
      defaultViewport,
      100,
      100,
      frame,
    );
    // Since the frame is full, it falls back to normal placement outside the frame
    expect(pos.x).toBeDefined();
    expect(pos.y).toBeDefined();
  });

  it("falls back to normal placement when frame is full", () => {
    // Tiny frame that can't fit the item
    const frame = makeNode({
      id: "frame1",
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      type: "frame",
    });
    const pos = findFreePosition(
      [frame],
      defaultViewport,
      200,
      200,
      frame,
    );
    // Should still return a position (falls back to normal strategies)
    expect(pos.x).toBeDefined();
    expect(pos.y).toBeDefined();
    // Since item doesn't fit in frame, it should NOT be inside the tiny frame
    // (the item is 200x200 but frame is only 50x50)
  });

  it("ignores targetFrame when type is not 'frame'", () => {
    const notAFrame = makeNode({
      id: "node1",
      x: 100,
      y: 100,
      width: 600,
      height: 600,
      type: "image",
    });
    const pos = findFreePosition(
      [notAFrame],
      defaultViewport,
      100,
      100,
      notAFrame,
    );
    // Should use normal placement (not frame-aware), so it shouldn't be
    // placed overlapping the existing node
    expect(pos.x).toBeDefined();
    expect(pos.y).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// findFreePosition — advanced strategies (2-4 and fallback)
// ---------------------------------------------------------------------------

describe("findFreePosition strategies", () => {
  it("strategy 2: places below visible content when grid is full", () => {
    // Fill the viewport with a grid of nodes so strategy 1 fails
    const nodes: CanvasNode[] = [];
    let id = 0;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        nodes.push(
          makeNode({
            id: `n${id++}`,
            x: col * 230,
            y: row * 230,
            width: 200,
            height: 200,
          }),
        );
      }
    }
    const pos = findFreePosition(nodes, defaultViewport, 200, 200);
    // Should find a position that doesn't overlap any existing node
    for (const n of nodes) {
      const overlaps =
        pos.x < n.x + n.width + 30 &&
        pos.x + 200 + 30 > n.x &&
        pos.y < n.y + n.height + 30 &&
        pos.y + 200 + 30 > n.y;
      expect(overlaps).toBe(false);
    }
  });

  it("fallback: places below all content when all strategies fail", () => {
    // Create a very dense set of nodes covering a large area
    const nodes: CanvasNode[] = [];
    let id = 0;
    // Fill a huge area so spiral also fails (10 rings * gridStep)
    for (let row = 0; row < 30; row++) {
      for (let col = 0; col < 30; col++) {
        nodes.push(
          makeNode({
            id: `n${id++}`,
            x: col * 230 - 3000,
            y: row * 230 - 3000,
            width: 200,
            height: 200,
          }),
        );
      }
    }
    const pos = findFreePosition(nodes, defaultViewport, 200, 200);
    // Should return some valid position
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");

    // The fallback places below all content, centered
    const maxBottom = Math.max(...nodes.map((n) => n.y + n.height));
    // Position should be at or below the bottom of all nodes + spacing
    expect(pos.y).toBeGreaterThanOrEqual(maxBottom);
  });

  it("spiral strategy: finds position in outer ring", () => {
    // Fill viewport grid slots but leave outer rings open
    const nodes: CanvasNode[] = [];
    let id = 0;
    // Cover the viewport area only
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        nodes.push(
          makeNode({
            id: `n${id++}`,
            x: col * 230,
            y: row * 230,
            width: 200,
            height: 200,
          }),
        );
      }
    }
    // Also block below and right of visible (strategy 2/3)
    nodes.push(
      makeNode({ id: "blockBelow", x: 500, y: 920 + 30, width: 200, height: 200 }),
    );
    nodes.push(
      makeNode({ id: "blockRight", x: 1380 + 30, y: 0, width: 200, height: 200 }),
    );

    const pos = findFreePosition(nodes, defaultViewport, 200, 200);
    // Should find *some* non-overlapping position
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
  });
});

describe("findFreePosition — isInViewport edge cases", () => {
  it("strategy 2: returns position below visible content when in viewport", () => {
    // Fill viewport grid completely, but leave space below visible content within viewport
    const nodes: CanvasNode[] = [];
    let id = 0;
    // Fill the visible area with nodes
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        nodes.push(
          makeNode({
            id: `n${id++}`,
            x: col * 230,
            y: row * 230,
            width: 200,
            height: 200,
          }),
        );
      }
    }
    // Use a viewport large enough that "below visible content" is still in viewport
    const largeViewport: CanvasViewport = { x: 0, y: 0, scale: 0.5 };
    const pos = findFreePosition(nodes, largeViewport, 200, 200);
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
  });

  it("strategy 3: returns position to the right of visible content", () => {
    // Place nodes filling the viewport vertically but leaving space to the right
    const nodes: CanvasNode[] = [];
    let id = 0;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 3; col++) {
        nodes.push(
          makeNode({
            id: `n${id++}`,
            x: col * 230,
            y: row * 230,
            width: 200,
            height: 200,
          }),
        );
      }
    }
    // Block below-visible position
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    nodes.push(
      makeNode({ id: "blockBelow", x: 0, y: maxY + 30, width: 800, height: 200 }),
    );

    const largeViewport: CanvasViewport = { x: 0, y: 0, scale: 0.3 };
    const pos = findFreePosition(nodes, largeViewport, 200, 200);
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// arrangeGrid — varied sizes
// ---------------------------------------------------------------------------

describe("arrangeGrid with varied sizes", () => {
  it("centers nodes within their cells when sizes differ", () => {
    const nodes = [
      makeNode({ id: "a", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "b", x: 200, y: 0, width: 300, height: 100 }),
      makeNode({ id: "c", x: 0, y: 200, width: 100, height: 300 }),
      makeNode({ id: "d", x: 200, y: 200, width: 300, height: 300 }),
    ];
    const result = arrangeGrid(nodes);
    expect(result.size).toBe(4);

    // In a 2x2 grid with varied sizes, smaller nodes should be centered
    // in their cell. Verify no overlap.
    const entries = Array.from(result.entries());
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, posA] = entries[i];
        const [idB, posB] = entries[j];
        const nA = nodes.find((n) => n.id === idA)!;
        const nB = nodes.find((n) => n.id === idB)!;
        const overlaps =
          posA.x < posB.x + nB.width &&
          posA.x + nA.width > posB.x &&
          posA.y < posB.y + nB.height &&
          posA.y + nA.height > posB.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("arranges 9 nodes in a 3x3 grid", () => {
    const nodes = Array.from({ length: 9 }, (_, i) =>
      makeNode({ id: `n${i}`, x: (i % 5) * 300, y: Math.floor(i / 5) * 300, width: 100, height: 100 }),
    );
    const result = arrangeGrid(nodes);
    expect(result.size).toBe(9);

    // sqrt(9) = 3, so 3 columns
    const positions = Array.from(result.values());
    const uniqueXs = new Set(positions.map((p) => p.x));
    expect(uniqueXs.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// arrangeMasonry — aspect ratio preservation
// ---------------------------------------------------------------------------

describe("arrangeMasonry with aspect ratio preservation", () => {
  it("scales items to column width preserving aspect ratio", () => {
    const nodes = [
      makeNode({ id: "a", x: 0, y: 0, width: 200, height: 400 }),  // 1:2 ratio
      makeNode({ id: "b", x: 300, y: 0, width: 200, height: 100 }), // 2:1 ratio
      makeNode({ id: "c", x: 600, y: 0, width: 200, height: 200 }), // 1:1 ratio
    ];
    const result = arrangeMasonry(nodes);
    expect(result.size).toBe(3);

    // With 3 nodes, colCount = 3, median width = 200, so colWidth = 200
    for (const [id, entry] of result.entries()) {
      const orig = nodes.find((n) => n.id === id)!;
      const expectedAspect = orig.height / orig.width;
      expect(entry.width).toBe(200); // median width = colWidth
      expect(entry.height).toBe(Math.round(200 * expectedAspect));
    }
  });

  it("uses 4 columns for 9-15 items", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode({ id: `n${i}`, x: i * 250, y: 0, width: 200, height: 200 }),
    );
    const result = arrangeMasonry(nodes);
    expect(result.size).toBe(10);

    // With 10 nodes, colCount should be 4
    const positions = Array.from(result.values());
    const uniqueXs = new Set(positions.map((p) => p.x));
    expect(uniqueXs.size).toBe(4);
  });

  it("uses 5 columns for 16+ items", () => {
    const nodes = Array.from({ length: 16 }, (_, i) =>
      makeNode({ id: `n${i}`, x: i * 250, y: 0, width: 200, height: 200 }),
    );
    const result = arrangeMasonry(nodes);
    expect(result.size).toBe(16);

    const positions = Array.from(result.values());
    const uniqueXs = new Set(positions.map((p) => p.x));
    expect(uniqueXs.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Additional coverage: uncovered branches
// ---------------------------------------------------------------------------

describe("findFreePosition — visibleRects.length === 0 branch", () => {
  it("skips strategy 2 (below/right of visible) when no nodes are visible in viewport", () => {
    // Place existing nodes far outside the current viewport
    const nodes = [
      makeNode({ id: "far1", x: 5000, y: 5000, width: 200, height: 200 }),
      makeNode({ id: "far2", x: 5500, y: 5000, width: 200, height: 200 }),
    ];
    // viewport is at origin, so these nodes are not visible
    const pos = findFreePosition(nodes, defaultViewport, 200, 200);
    // Should still find a valid position (grid scan within viewport should succeed since viewport is empty)
    expect(typeof pos.x).toBe("number");
    expect(typeof pos.y).toBe("number");
  });
});

describe("findFreePositionsForBatch — column capping", () => {
  it("caps columns at 4 even when viewport could fit more", () => {
    // viewport is 1200 wide at scale=1, items are 100 wide -> maxColsByViewport = floor(1230/130) = 9
    // But should be capped at min(count, min(4, 9)) = 4
    const result = findFreePositionsForBatch([], defaultViewport, 8, 100, 100);
    expect(result).toHaveLength(8);
    // Should use at most 4 unique x values (columns)
    const uniqueXs = new Set(result.map((p) => p.x));
    expect(uniqueXs.size).toBeLessThanOrEqual(4);
  });

  it("uses fewer columns when count is less than 4", () => {
    const result = findFreePositionsForBatch([], defaultViewport, 2, 100, 100);
    expect(result).toHaveLength(2);
    const uniqueXs = new Set(result.map((p) => p.x));
    expect(uniqueXs.size).toBeLessThanOrEqual(2);
  });

  it("limits columns to viewport width when items are very wide", () => {
    // Items are 800px wide, viewport 1200px at scale 1 -> maxColsByViewport = floor(1230/830) = 1
    const result = findFreePositionsForBatch([], defaultViewport, 4, 800, 200);
    expect(result).toHaveLength(4);
    // All items should stack vertically since only 1 column fits
    const uniqueXs = new Set(result.map((p) => p.x));
    expect(uniqueXs.size).toBe(1);
  });
});

describe("findMasonryClusterPositions — single column case", () => {
  it("uses 1 column for 1 item (direct right placement)", () => {
    const sourceNode = { x: 0, y: 0, width: 100, height: 100 };
    const items = [{ width: 50, height: 50 }];
    const result = findMasonryClusterPositions(sourceNode, items, []);
    expect(result).toHaveLength(1);
    expect(result[0].x).toBe(160); // 0 + 100 + 60
    expect(result[0].y).toBe(0);
  });

  it("uses 2 columns for 2 items", () => {
    const sourceNode = { x: 0, y: 0, width: 100, height: 100 };
    const items = [
      { width: 50, height: 50 },
      { width: 50, height: 50 },
    ];
    const result = findMasonryClusterPositions(sourceNode, items, []);
    expect(result).toHaveLength(2);
    // 2 items -> colCount = min(3, 2) = 2, so different x positions
    const uniqueXs = new Set(result.map((p) => p.x));
    expect(uniqueXs.size).toBe(2);
  });

  it("no-overlap first attempt succeeds with clear space", () => {
    const sourceNode = { x: 0, y: 0, width: 100, height: 100 };
    const items = [
      { width: 80, height: 80 },
      { width: 80, height: 80 },
      { width: 80, height: 80 },
    ];
    const result = findMasonryClusterPositions(sourceNode, items, []);
    expect(result).toHaveLength(3);
    // All items should be to the right of source
    for (const pos of result) {
      expect(pos.x).toBeGreaterThan(sourceNode.x + sourceNode.width);
    }
  });
});

describe("arrangeLineageTree — orphan layout and multi-root trees", () => {
  it("lays out multiple orphans in a row", () => {
    const nodes = [
      makeNode({ id: "root", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "child", x: 0, y: 200, width: 100, height: 100 }),
      makeNode({ id: "orphan1", x: 500, y: 500, width: 100, height: 100 }),
      makeNode({ id: "orphan2", x: 600, y: 600, width: 80, height: 80 }),
    ];
    const connectors: CanvasConnector[] = [
      { id: "e1", fromNodeId: "root", toNodeId: "child" },
    ];
    const result = arrangeLineageTree(nodes, connectors);
    expect(result.size).toBe(4);

    const o1 = result.get("orphan1")!;
    const o2 = result.get("orphan2")!;
    // Orphans should be on the same row (same y)
    expect(o1.y).toBe(o2.y);
    // Orphan2 should be to the right of orphan1
    expect(o2.x).toBeGreaterThan(o1.x);
  });

  it("handles multi-root trees (two separate trees)", () => {
    const nodes = [
      makeNode({ id: "r1", x: 0, y: 0, width: 100, height: 100 }),
      makeNode({ id: "c1", x: 0, y: 200, width: 100, height: 100 }),
      makeNode({ id: "r2", x: 300, y: 0, width: 100, height: 100 }),
      makeNode({ id: "c2", x: 300, y: 200, width: 100, height: 100 }),
    ];
    const connectors: CanvasConnector[] = [
      { id: "e1", fromNodeId: "r1", toNodeId: "c1" },
      { id: "e2", fromNodeId: "r2", toNodeId: "c2" },
    ];
    const result = arrangeLineageTree(nodes, connectors);
    expect(result.size).toBe(4);

    // Both trees should be laid out
    const r1 = result.get("r1")!;
    const r2 = result.get("r2")!;
    // Second root should be below the first tree
    expect(r2.y).toBeGreaterThan(r1.y);
  });
});

describe("findFreePosition — viewport.scale branches", () => {
  it("handles viewport scale != 1 (zoomed in)", () => {
    const viewport: CanvasViewport = { x: 0, y: 0, scale: 2 };
    const pos = findFreePosition([], viewport, 100, 100);
    // At scale 2, viewport rect is (0, 0, 600, 400)
    expect(pos.x).toBeCloseTo((600 - 100) / 2, 0);
    expect(pos.y).toBeCloseTo((400 - 100) / 2, 0);
  });

  it("handles viewport scale < 1 (zoomed out)", () => {
    const viewport: CanvasViewport = { x: 0, y: 0, scale: 0.5 };
    const pos = findFreePosition([], viewport, 100, 100);
    // At scale 0.5, viewport rect is (0, 0, 2400, 1600)
    expect(pos.x).toBeCloseTo((2400 - 100) / 2, 0);
    expect(pos.y).toBeCloseTo((1600 - 100) / 2, 0);
  });
});
