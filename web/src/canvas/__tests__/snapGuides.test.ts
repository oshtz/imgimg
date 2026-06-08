import { describe, it, expect } from "vitest";
import { computeSnapGuides } from "../snapGuides";
import type { CanvasNode } from "../types";

function makeNode(overrides: Partial<CanvasNode> & { id: string }): CanvasNode {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    naturalWidth: 100,
    naturalHeight: 100,
    zIndex: 1,
    ...overrides,
  };
}

describe("computeSnapGuides", () => {
  it("returns original dx/dy and no guides when draggedNodes is empty", () => {
    const result = computeSnapGuides([], [makeNode({ id: "a" })], 10, 20);
    expect(result).toEqual({ snappedDx: 10, snappedDy: 20, guides: [] });
  });

  it("returns original dx/dy and no guides when otherNodes is empty", () => {
    const result = computeSnapGuides([makeNode({ id: "a" })], [], 10, 20);
    expect(result).toEqual({ snappedDx: 10, snappedDy: 20, guides: [] });
  });

  it("snaps dx when dragged node's left edge is near other node's left edge", () => {
    const dragged = [makeNode({ id: "d", x: 0, y: 300, width: 100, height: 100 })];
    const other = [makeNode({ id: "o", x: 200, y: 0, width: 100, height: 100 })];
    // Dragging with dx=197 would put left edge at 197, which is 3px from 200
    const result = computeSnapGuides(dragged, other, 197, 0, 5);
    expect(result.snappedDx).toBe(200); // snapped to align left edges
    expect(result.guides).toContainEqual({ orientation: "v", position: 200 });
  });

  it("snaps dy when dragged node's top edge is near other node's top edge", () => {
    const dragged = [makeNode({ id: "d", x: 300, y: 0, width: 100, height: 100 })];
    const other = [makeNode({ id: "o", x: 0, y: 200, width: 100, height: 100 })];
    // Dragging with dy=198 would put top at 198, which is 2px from 200
    const result = computeSnapGuides(dragged, other, 0, 198, 5);
    expect(result.snappedDy).toBe(200);
    expect(result.guides).toContainEqual({ orientation: "h", position: 200 });
  });

  it("snaps center-to-center", () => {
    // Dragged: 100x100 at (0,0), center = (50,50)
    // Other:  100x100 at (200,200), center = (250,250)
    const dragged = [makeNode({ id: "d", x: 0, y: 0, width: 100, height: 100 })];
    const other = [makeNode({ id: "o", x: 200, y: 200, width: 100, height: 100 })];
    // dx=198 => dragged center x = 50+198 = 248, which is 2px from 250
    // dy=202 => dragged center y = 50+202 = 252, which is 2px from 250
    const result = computeSnapGuides(dragged, other, 198, 202, 5);
    expect(result.snappedDx).toBe(200); // corrected so center x = 250
    expect(result.snappedDy).toBe(200); // corrected so center y = 250
  });

  it("does not snap when beyond threshold", () => {
    const dragged = [makeNode({ id: "d", x: 0, y: 0, width: 100, height: 100 })];
    const other = [makeNode({ id: "o", x: 200, y: 200, width: 100, height: 100 })];
    // dx=10 => left at 10, far from 200. center at 60, far from 250.
    const result = computeSnapGuides(dragged, other, 10, 10, 5);
    expect(result.snappedDx).toBe(10);
    expect(result.snappedDy).toBe(10);
    expect(result.guides).toHaveLength(0);
  });

  it("returns guides on both axes when snapping in both directions", () => {
    const dragged = [makeNode({ id: "d", x: 0, y: 0, width: 100, height: 100 })];
    const other = [makeNode({ id: "o", x: 200, y: 300, width: 100, height: 100 })];
    // dx=198 => left at 198, 2px from 200
    // dy=298 => top at 298, 2px from 300
    const result = computeSnapGuides(dragged, other, 198, 298, 5);
    expect(result.guides.length).toBe(2);
    const orientations = result.guides.map((g) => g.orientation);
    expect(orientations).toContain("v");
    expect(orientations).toContain("h");
  });

  it("uses default threshold of 5", () => {
    const dragged = [makeNode({ id: "d", x: 0, y: 0, width: 100, height: 100 })];
    const other = [makeNode({ id: "o", x: 100, y: 0, width: 100, height: 100 })];
    // dx=96 => right edge at 96+100=196, which is 4px from other's left (100)
    // Actually: dragged left at 96, right at 196; other left at 100, right at 200
    // left(96) vs left(100) = 4px => within threshold
    const result = computeSnapGuides(dragged, other, 96, 0);
    expect(result.snappedDx).toBe(100); // snapped
  });

  it("snaps to right edge of other node", () => {
    const dragged = [makeNode({ id: "d", x: 0, y: 0, width: 100, height: 100 })];
    const other = [makeNode({ id: "o", x: 200, y: 0, width: 150, height: 100 })];
    // Other right edge = 350
    // Dragging left to 348 => 2px from 350
    const result = computeSnapGuides(dragged, other, 348, 0, 5);
    expect(result.snappedDx).toBe(350);
    expect(result.guides).toContainEqual({ orientation: "v", position: 350 });
  });

  it("snaps to bottom edge of other node", () => {
    const dragged = [makeNode({ id: "d", x: 0, y: 0, width: 100, height: 100 })];
    const other = [makeNode({ id: "o", x: 0, y: 200, width: 100, height: 150 })];
    // Other bottom edge = 350
    // Dragging top to 348 => 2px from 350
    const result = computeSnapGuides(dragged, other, 0, 348, 5);
    expect(result.snappedDy).toBe(350);
    expect(result.guides).toContainEqual({ orientation: "h", position: 350 });
  });
});
